import { tx } from '../config/database.js';
import { HttpError } from '../utils/http-error.js';
import { int, str, num } from '../utils/validators.js';

export default class PedidoService {
  constructor(pedidoRepository, senalRepository) {
    this.pedidoRepository = pedidoRepository;
    this.senalRepository = senalRepository;
  }

  async obtenerPedidos(filtros) {
    return this.pedidoRepository.findAll(filtros);
  }

  async obtenerPedidoPorId(id) {
    const cab = await this.pedidoRepository.findResumenById(id);
    if (!cab) throw new HttpError(404, 'Pedido no encontrado.');
    const lineas = await this.pedidoRepository.findDetallesByPedidoId(id);
    return { ...cab, lineas };
  }

  async resolverSenal(client, linea, i) {
    if (linea.id_senal) {
      return int(linea.id_senal, `lineas[${i}].id_senal`);
    }
    const n = linea.nueva_senal;
    if (!n) {
      throw new HttpError(400, `La línea ${i + 1} necesita id_senal o nueva_senal.`);
    }

    const d = {
      nombre: str(n.nombre, `lineas[${i}].nombre`, { max: 150 }),
      id_material: int(n.id_material, `lineas[${i}].id_material`),
      id_vinil: int(n.id_vinil, `lineas[${i}].id_vinil`),
      ancho: num(n.ancho_cm, `lineas[${i}].ancho_cm`, { positive: true }),
      alto: num(n.alto_cm, `lineas[${i}].alto_cm`, { positive: true }),
      imagen: str(n.imagen_referencial || n.imagen_url, `lineas[${i}].imagen_referencial`, { required: false, max: 2000 }),
    };

    const foundId = await this.pedidoRepository.buscarSenalSimilar(d, client);
    if (foundId) return foundId;

    const ins = await this.senalRepository.create(
      {
        nombre: d.nombre,
        id_material: d.id_material,
        id_vinil: d.id_vinil,
        ancho_cm: d.ancho,
        alto_cm: d.alto,
        imagen_referencial: d.imagen,
      },
      client
    );
    return ins.id_senal;
  }

  async crearPedido(cab, lineas) {
    if (!Array.isArray(lineas) || !lineas.length) {
      throw new HttpError(400, 'El pedido debe tener al menos una línea.');
    }
    if (lineas.length > 300) {
      throw new HttpError(400, 'Máximo 300 líneas por pedido.');
    }

    const idPedido = await tx(async (client) => {
      const id = await this.pedidoRepository.createPedido(cab, client);

      // Agrupa líneas repetidas de la misma señal (la BD exige una línea por señal)
      const porSenal = new Map();
      for (const [i, l] of lineas.entries()) {
        const idSenal = await this.resolverSenal(client, l, i);
        const cant = int(l.cantidad, `lineas[${i}].cantidad`, { min: 1 });
        porSenal.set(idSenal, (porSenal.get(idSenal) || 0) + cant);
      }

      // Ordenar por id_senal para evitar bloqueos cruzados entre pedidos simultáneos
      const ordenados = [...porSenal.entries()].sort((a, b) => a[0] - b[0]);
      for (const [idSenal, cant] of ordenados) {
        await this.pedidoRepository.createDetalle(id, idSenal, cant, client);
      }

      return id;
    });

    return this.obtenerPedidoPorId(idPedido);
  }

  async actualizarPedido(id, fields) {
    const sets = [];
    const params = [];

    if (fields.prioridad !== undefined) {
      params.push(fields.prioridad);
      sets.push(`prioridad = $${params.length}`);
    }
    if (fields.fecha_requerida !== undefined) {
      params.push(fields.fecha_requerida);
      sets.push(`fecha_requerida = $${params.length}`);
    }
    if (fields.observacion !== undefined) {
      params.push(fields.observacion);
      sets.push(`observacion = $${params.length}`);
    }

    if (!sets.length) {
      throw new HttpError(400, 'No hay campos para actualizar.');
    }

    params.push(id);
    const actualizado = await this.pedidoRepository.updatePedido(id, sets, params);
    if (!actualizado) {
      throw new HttpError(409, 'Pedido no encontrado o ya entregado.');
    }

    return this.pedidoRepository.findResumenById(id);
  }

  async agregarLinea(idPedido, data) {
    const idDetalle = await tx(async (client) => {
      const p = await this.pedidoRepository.getPedidoLock(idPedido, client);
      if (!p) throw new HttpError(404, 'Pedido no encontrado.');
      if (p.fecha_entrega) throw new HttpError(409, 'El pedido ya fue entregado.');

      const idSenal = await this.resolverSenal(client, data, 0);
      const cantidad = int(data.cantidad, 'cantidad', { min: 1 });

      return this.pedidoRepository.createDetalle(idPedido, idSenal, cantidad, client);
    });

    return this.pedidoRepository.findDetalleById(idDetalle);
  }

  async marcarEntregado(id, idColaborador) {
    const entregado = await this.pedidoRepository.marcarEntregado(id, idColaborador);
    if (!entregado) {
      throw new HttpError(409, 'Pedido no encontrado o ya entregado.');
    }
    return this.pedidoRepository.findResumenById(id);
  }

  async eliminarPedido(id) {
    const eliminado = await this.pedidoRepository.deletePedido(id);
    if (!eliminado) throw new HttpError(404, 'Pedido no encontrado.');
    return true;
  }

  async eliminarLinea(idDetalle) {
    await tx(async (client) => {
      const lock = await this.pedidoRepository.getDetallePedidoWithPedidoLock(idDetalle, client);
      if (!lock) throw new HttpError(404, 'Línea no encontrada.');
      if (lock.fecha_entrega) throw new HttpError(409, 'El pedido ya fue entregado.');
      await this.pedidoRepository.deleteDetalle(idDetalle, client);
    });
    return true;
  }
}

