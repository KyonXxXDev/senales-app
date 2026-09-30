import { pool } from '../config/database.js';

export default class TrabajoRepository {
  constructor(db = pool) {
    this.db = db;
  }

  async getBandejaArea(area, { prioridad, terminados = false } = {}) {
    const col = area === 'MARKETING' ? 'estado_marketing' : 'estado_produccion';
    const params = [area];
    let filtro = '';
    if (prioridad) {
      params.push(prioridad);
      filtro = `AND p.prioridad = $${params.length}::prioridad_pedido`;
    }

    const sql = `
      SELECT d.id_detalle_pedido, d.id_pedido, d.cantidad, d.cantidad_desde_stock, d.cantidad_a_producir,
             d.estado_marketing, d.estado_produccion, d.estado_global, d.${col} AS estado_area,
             p.prioridad, p.fecha_pedido, p.fecha_requerida, p.observacion, c.nombre AS cliente,
             s.id_senal, s.nombre AS senal, s.ancho_cm, s.alto_cm, s.imagen_url, s.imagen_url AS imagen_referencial,
             m.nombre AS material, v.nombre AS vinil,
             COALESCE((SELECT SUM(r.cantidad_procesada) FROM registro_tiempo r JOIN etapa e ON e.id_etapa = r.id_etapa
                        WHERE r.id_detalle_pedido = d.id_detalle_pedido AND e.area = $1
                          AND e.es_final AND r.fin IS NOT NULL), 0) AS unidades_terminadas,
             COALESCE((SELECT json_agg(json_build_object(
                          'id_registro_tiempo', r.id_registro_tiempo, 'id_etapa', r.id_etapa, 'etapa', e.nombre,
                          'inicio', r.inicio, 'fin', r.fin, 'cantidad_procesada', r.cantidad_procesada,
                          'duracion_min', r.duracion_min, 'id_colaborador', r.id_colaborador, 'colaborador', co.nombre, 'observacion', r.observacion)
                          ORDER BY r.inicio)
                         FROM registro_tiempo r
                         JOIN etapa e ON e.id_etapa = r.id_etapa
                         LEFT JOIN colaborador co ON co.id_colaborador = r.id_colaborador
                        WHERE r.id_detalle_pedido = d.id_detalle_pedido AND e.area = $1), '[]') AS registros
        FROM detalle_pedido d
        JOIN pedido p   ON p.id_pedido = d.id_pedido
        JOIN cliente c  ON c.id_cliente = p.id_cliente
        JOIN senal s    ON s.id_senal = d.id_senal
        JOIN material m ON m.id_material = s.id_material
        JOIN vinil v    ON v.id_vinil = s.id_vinil
       WHERE p.fecha_entrega IS NULL
         AND d.${col} ${terminados ? "<> 'NO REQUIERE'" : "IN ('PENDIENTE','EN PROCESO')"}
         ${filtro}
       ORDER BY p.prioridad DESC, p.fecha_pedido, d.id_pedido, d.id_detalle_pedido`;

    const { rows } = await this.db.query(sql, params);
    return rows;
  }

  async findDetalleParaBloqueo(idDetalle, client = this.db) {
    const { rows } = await client.query(
      'SELECT id_detalle_pedido, id_pedido, cantidad_a_producir, estado_marketing, estado_produccion FROM detalle_pedido WHERE id_detalle_pedido = $1 FOR UPDATE',
      [idDetalle]
    );
    return rows[0] || null;
  }

  async haySesionAbierta(idDetalle, idEtapa, client = this.db) {
    const { rows } = await client.query(
      'SELECT 1 FROM registro_tiempo WHERE id_detalle_pedido = $1 AND id_etapa = $2 AND fin IS NULL',
      [idDetalle, idEtapa]
    );
    return rows.length > 0;
  }

  async insertRegistroTiempo(data, client = this.db) {
    const { rows } = await client.query(
      `INSERT INTO registro_tiempo (id_detalle_pedido, id_etapa, id_colaborador, inicio, fin, cantidad_procesada, observacion)
       VALUES ($1, $2, $3, COALESCE($4::timestamptz, now()), $5, $6, $7) RETURNING *`,
      [
        data.id_detalle_pedido,
        data.id_etapa,
        data.id_colaborador || null,
        data.inicio || null,
        data.fin || null,
        data.cantidad_procesada || 0,
        data.observacion || null,
      ]
    );
    return rows[0];
  }

  async findRegistroTiempo(id, client = this.db) {
    const { rows } = await client.query(
      `SELECT r.*, e.area, e.nombre AS etapa_nombre, e.es_final, d.cantidad_a_producir,
              d.estado_marketing, d.estado_produccion
         FROM registro_tiempo r
         JOIN etapa e ON e.id_etapa = r.id_etapa
         JOIN detalle_pedido d ON d.id_detalle_pedido = r.id_detalle_pedido
        WHERE r.id_registro_tiempo = $1 FOR UPDATE OF r, d`,
      [id]
    );
    return rows[0] || null;
  }

  async finalizarRegistroTiempo(id, cantidad, observacion, client = this.db) {
    const { rows } = await client.query(
      `UPDATE registro_tiempo SET fin = GREATEST(now(), inicio), cantidad_procesada = $1,
              observacion = COALESCE($2, observacion)
        WHERE id_registro_tiempo = $3 RETURNING *`,
      [cantidad, observacion || null, id]
    );
    return rows[0] || null;
  }

  async updateRegistroTiempo(id, sets, params, client = this.db) {
    const sql = `UPDATE registro_tiempo SET ${sets.join(', ')} WHERE id_registro_tiempo = $${params.length} RETURNING *`;
    const { rows } = await client.query(sql, params);
    return rows[0] || null;
  }

  async deleteRegistroTiempo(id, client = this.db) {
    const { rowCount } = await client.query(
      'DELETE FROM registro_tiempo WHERE id_registro_tiempo = $1',
      [id]
    );
    return rowCount > 0;
  }

  async getEtapaInfo(idEtapa, client = this.db) {
    const { rows } = await client.query(
      'SELECT id_etapa, area, nombre, es_final FROM etapa WHERE id_etapa = $1',
      [idEtapa]
    );
    return rows[0] || null;
  }

  async getUnidadesProcesadasEtapaFinal(idDetalle, area, excluirIdRegistro = null, client = this.db) {
    const { rows } = await client.query(
      `SELECT COALESCE(SUM(r.cantidad_procesada), 0) AS hechas
         FROM registro_tiempo r JOIN etapa e ON e.id_etapa = r.id_etapa
        WHERE r.id_detalle_pedido = $1 AND e.area = $2 AND e.es_final
          AND ($3::int IS NULL OR r.id_registro_tiempo <> $3)`,
      [idDetalle, area, excluirIdRegistro]
    );
    return Number(rows[0]?.hechas || 0);
  }

  async getHistorialLinea(idDetalle) {
    const { rows } = await this.db.query(
      `SELECT r.*, e.area, e.nombre AS etapa, co.nombre AS colaborador
         FROM registro_tiempo r
         JOIN etapa e ON e.id_etapa = r.id_etapa
         LEFT JOIN colaborador co ON co.id_colaborador = r.id_colaborador
        WHERE r.id_detalle_pedido = $1 ORDER BY r.inicio`,
      [idDetalle]
    );
    return rows;
  }

  /**
   * Recalcula el estado de un área para una línea tras editar o borrar sesiones de tiempo.
   * Si la línea alcanza TERMINADO, inserta automáticamente un movimiento de ENTRADA en stock
   * (solo si no existe ya uno por esta combinación detalle+área para evitar duplicados).
   *
   * @returns {{ estado: string, stockIngresado: boolean }}
   */
  async sincronizarEstadoArea(idDetalle, area, client = this.db) {
    const col = area === 'MARKETING' ? 'estado_marketing' : 'estado_produccion';

    // Obtener sesiones y unidades en etapa final junto con el estado actual
    const { rows: conteo } = await client.query(
      `SELECT COUNT(*) AS total_sesiones,
              COALESCE(SUM(CASE WHEN e.es_final AND r.fin IS NOT NULL THEN r.cantidad_procesada ELSE 0 END), 0) AS hechas,
              d.cantidad_a_producir AS meta,
              d.${col} AS estado_actual,
              d.id_senal,
              d.id_pedido
         FROM detalle_pedido d
         LEFT JOIN registro_tiempo r ON r.id_detalle_pedido = d.id_detalle_pedido
         LEFT JOIN etapa e ON e.id_etapa = r.id_etapa AND e.area = $2
        WHERE d.id_detalle_pedido = $1
        GROUP BY d.id_detalle_pedido, d.cantidad_a_producir, d.${col}, d.id_senal, d.id_pedido`,
      [idDetalle, area]
    );

    if (!conteo.length) return { estado: 'PENDIENTE', stockIngresado: false };

    const { total_sesiones, hechas, meta, estado_actual, id_senal, id_pedido } = conteo[0];
    const totalSesiones = Number(total_sesiones || 0);
    const unidadesHechas = Number(hechas || 0);
    const metaNum = Number(meta || 0);

    let nuevoEstado = 'PENDIENTE';
    if (unidadesHechas >= metaNum && metaNum > 0) {
      nuevoEstado = 'TERMINADO';
    } else if (totalSesiones > 0) {
      nuevoEstado = 'EN PROCESO';
    }

    // Actualizar estado del área (solo si no es NO REQUIERE)
    await client.query(
      `UPDATE detalle_pedido SET ${col} = $1 WHERE id_detalle_pedido = $2 AND ${col} <> 'NO REQUIERE'`,
      [nuevoEstado, idDetalle]
    );

    // ── Ingresar al stock cuando recién se alcanza TERMINADO ──────────────────
    let stockIngresado = false;
    if (nuevoEstado === 'TERMINADO' && estado_actual !== 'TERMINADO' && unidadesHechas > 0) {
      // Verificar que no exista ya un movimiento de stock para este detalle+área
      const { rows: existe } = await client.query(
        `SELECT 1 FROM movimiento_stock
          WHERE id_detalle_pedido = $1 AND origen_area = $2 AND tipo = 'ENTRADA'
          LIMIT 1`,
        [idDetalle, area]
      );

      if (!existe.length) {
        await client.query(
          `INSERT INTO movimiento_stock
             (id_senal, tipo, cantidad, id_detalle_pedido, origen_area, observacion)
           VALUES ($1, 'ENTRADA', $2, $3, $4, $5)`,
          [
            id_senal,
            unidadesHechas,
            idDetalle,
            area,
            `Producción terminada — área ${area} — pedido #${id_pedido}`,
          ]
        );
        stockIngresado = true;
        console.info(
          `[Stock] +${unidadesHechas} uds → señal #${id_senal} | detalle #${idDetalle} | área ${area} | pedido #${id_pedido}`
        );
      }
    }

    // ── Recalcular estado_global del detalle ─────────────────────────────────
    // Nota: estado_global es una columna GENERATED ALWAYS AS en PostgreSQL;
    // se recalcula automáticamente al actualizar estado_marketing / estado_produccion.
    // No es necesario un UPDATE adicional.

    return { estado: nuevoEstado, stockIngresado };
  }

  /**
   * Devuelve los colaboradores activos de un área para notificaciones.
   * @param {'MARKETING'|'PRODUCCION'} area
   * @param {object} [client]
   */
  async obtenerColaboradoresPorArea(area, client = this.db) {
    const { rows } = await client.query(
      `SELECT id_colaborador, nombre, email FROM colaborador
        WHERE activo = TRUE AND area = $1`,
      [area]
    );
    return rows;
  }
}

