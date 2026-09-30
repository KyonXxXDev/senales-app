import { tx } from '../config/database.js';
import { HttpError } from '../utils/http-error.js';

export default class TrabajoService {
  /**
   * @param {import('../repository/trabajo.repository.js').default} trabajoRepository
   * @param {import('./notificacion.service.js').default} [notificacionService]
   */
  constructor(trabajoRepository, notificacionService = null) {
    this.trabajoRepository = trabajoRepository;
    this.notificacionService = notificacionService;
  }

  async obtenerBandeja(area, filtros) {
    return this.trabajoRepository.getBandejaArea(area, filtros);
  }

  async validarCantidadFinal(client, idDetalle, idEtapa, cantidad, excluirIdRegistro, meta) {
    const e = await this.trabajoRepository.getEtapaInfo(idEtapa, client);
    if (!e) throw new HttpError(400, 'Etapa inexistente.');
    if (!e.es_final || cantidad === 0) return e.area;

    const hechas = await this.trabajoRepository.getUnidadesProcesadasEtapaFinal(
      idDetalle,
      e.area,
      excluirIdRegistro,
      client
    );

    const faltan = meta - hechas;
    if (cantidad > faltan) {
      throw new HttpError(
        400,
        `Solo faltan ${Math.max(faltan, 0)} unidades por terminar en esta línea.`
      );
    }
    return e.area;
  }

  async iniciarSesion({ id_detalle_pedido, id_etapa, id_colaborador, inicio, fin, cantidad_procesada, observacion }) {
    return tx(async (client) => {
      const d = await this.trabajoRepository.findDetalleParaBloqueo(id_detalle_pedido, client);
      if (!d) throw new HttpError(404, 'Línea no encontrada.');

      if (!fin) {
        const abierta = await this.trabajoRepository.haySesionAbierta(id_detalle_pedido, id_etapa, client);
        if (abierta) {
          throw new HttpError(409, 'Esa etapa ya tiene una sesión en curso para esta línea.');
        }
      }

      await this.validarCantidadFinal(
        client,
        id_detalle_pedido,
        id_etapa,
        cantidad_procesada || 0,
        null,
        d.cantidad_a_producir
      );

      const registro = await this.trabajoRepository.insertRegistroTiempo(
        {
          id_detalle_pedido,
          id_etapa,
          id_colaborador,
          inicio,
          fin,
          cantidad_procesada,
          observacion,
        },
        client
      );

      // Si la sesión ya cierra (fin enviado), sincronizar estado y stock
      if (fin) {
        await this._sincronizarConStock(client, id_detalle_pedido, id_etapa);
      }

      return registro;
    });
  }

  async finalizarSesion(idRegistro, cantidad, observacion) {
    return tx(async (client) => {
      const reg = await this.trabajoRepository.findRegistroTiempo(idRegistro, client);
      if (!reg) throw new HttpError(404, 'Registro de tiempo no encontrado.');
      if (reg.fin) throw new HttpError(409, 'Esta sesión ya estaba cerrada.');

      await this.validarCantidadFinal(
        client,
        reg.id_detalle_pedido,
        reg.id_etapa,
        cantidad,
        idRegistro,
        reg.cantidad_a_producir
      );

      const actualizado = await this.trabajoRepository.finalizarRegistroTiempo(idRegistro, cantidad, observacion, client);

      // Sincronizar estado del área y agregar al stock si aplica
      await this._sincronizarConStock(client, reg.id_detalle_pedido, reg.id_etapa);

      return actualizado;
    });
  }

  /**
   * Modifica una sesión de tiempo existente (corregir fecha/hora, cantidad, colaborador, etc.)
   */
  async modificarSesion(idRegistro, fields) {
    return tx(async (client) => {
      const reg = await this.trabajoRepository.findRegistroTiempo(idRegistro, client);
      if (!reg) throw new HttpError(404, 'Registro de tiempo no encontrado.');

      const sets = [];
      const params = [];

      const nuevoInicio = fields.inicio !== undefined ? fields.inicio : reg.inicio;
      const nuevoFin = fields.fin !== undefined ? fields.fin : reg.fin;
      const nuevaCantidad = fields.cantidad_procesada !== undefined ? fields.cantidad_procesada : reg.cantidad_procesada;
      const nuevaEtapa = fields.id_etapa !== undefined ? fields.id_etapa : reg.id_etapa;

      if (nuevoFin && new Date(nuevoFin) < new Date(nuevoInicio)) {
        throw new HttpError(400, 'La fecha/hora de fin no puede ser anterior a la de inicio.');
      }

      if (nuevaCantidad !== undefined && nuevaCantidad < 0) {
        throw new HttpError(400, 'La cantidad procesada no puede ser negativa.');
      }

      // Validar límite si es etapa final y está cerrada
      if (nuevoFin) {
        await this.validarCantidadFinal(
          client,
          reg.id_detalle_pedido,
          nuevaEtapa,
          nuevaCantidad,
          idRegistro,
          reg.cantidad_a_producir
        );
      }

      if (fields.inicio !== undefined) {
        params.push(fields.inicio);
        sets.push(`inicio = $${params.length}`);
      }
      if (fields.fin !== undefined) {
        params.push(fields.fin);
        sets.push(`fin = $${params.length}`);
      }
      if (fields.cantidad_procesada !== undefined) {
        params.push(fields.cantidad_procesada);
        sets.push(`cantidad_procesada = $${params.length}`);
      }
      if (fields.id_colaborador !== undefined) {
        params.push(fields.id_colaborador || null);
        sets.push(`id_colaborador = $${params.length}`);
      }
      if (fields.id_etapa !== undefined) {
        params.push(fields.id_etapa);
        sets.push(`id_etapa = $${params.length}`);
      }
      if (fields.observacion !== undefined) {
        params.push(fields.observacion);
        sets.push(`observacion = $${params.length}`);
      }

      if (!sets.length) {
        throw new HttpError(400, 'No hay campos para actualizar.');
      }

      params.push(idRegistro);
      const updated = await this.trabajoRepository.updateRegistroTiempo(idRegistro, sets, params, client);

      // Sincronizar estado del área y stock por si la modificación alteró las unidades finales
      await this._sincronizarConStock(client, reg.id_detalle_pedido, nuevaEtapa);

      return updated;
    });
  }

  /**
   * Elimina una sesión de tiempo registrada y recalcula el estado de la línea.
   */
  async eliminarSesion(idRegistro) {
    return tx(async (client) => {
      const reg = await this.trabajoRepository.findRegistroTiempo(idRegistro, client);
      if (!reg) throw new HttpError(404, 'Registro de tiempo no encontrado.');

      await this.trabajoRepository.deleteRegistroTiempo(idRegistro, client);

      // Sincronizar el estado del área (p. ej. si estaba TERMINADO y se borra la sesión, vuelve a EN PROCESO o PENDIENTE)
      await this.trabajoRepository.sincronizarEstadoArea(reg.id_detalle_pedido, reg.area, client);

      return true;
    });
  }

  async obtenerHistorialLinea(idDetalle) {
    return this.trabajoRepository.getHistorialLinea(idDetalle);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Helpers internos
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Sincroniza el estado del área para una etapa dada y, si la línea acaba de
   * pasar a TERMINADO, emite una notificación informativa a los colaboradores del área.
   *
   * @private
   */
  async _sincronizarConStock(client, idDetalle, idEtapa) {
    // Obtener el área a la que pertenece la etapa
    const etapa = await this.trabajoRepository.getEtapaInfo(idEtapa, client);
    if (!etapa) return;

    const { estado, stockIngresado } = await this.trabajoRepository.sincronizarEstadoArea(
      idDetalle,
      etapa.area,
      client
    );

    // Notificar al área cuando se ingresó stock nuevo
    if (stockIngresado && this.notificacionService) {
      try {
        const colaboradores = await this.trabajoRepository.obtenerColaboradoresPorArea(etapa.area, client);
        const ids = colaboradores.map((c) => c.id_colaborador);
        if (ids.length) {
          // Usar pool directamente (fuera de la tx) para no bloquear si la tabla no existe aún
          await this.notificacionService.crear(
            {
              idColaboradores: ids,
              tipo: 'INFO',
              titulo: `✅ Línea terminada — ${etapa.area}`,
              mensaje: `La línea #${idDetalle} finalizó en ${etapa.area} y sus unidades fueron ingresadas al stock automáticamente.`,
              url: `/trabajo/bandeja/${etapa.area.toLowerCase()}`,
            },
            client
          );
        }
      } catch (notifErr) {
        console.warn('[TrabajoService] No se pudo crear la notificación de stock:', notifErr.message);
      }
    }

    return estado;
  }
}
