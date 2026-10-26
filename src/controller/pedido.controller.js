import { int, str, oneOf, date } from '../utils/validators.js';

const PRIORIDADES = ['BAJA', 'MEDIA', 'ALTA'];
const ESTADOS_PEDIDO = ['PENDIENTE', 'EN PROCESO', 'LISTO PARA ENTREGA', 'ENTREGADO'];

export default class PedidoController {
  constructor(pedidoService) {
    this.pedidoService = pedidoService;
  }

  getAll = async (req, res) => {
    const estado = req.query.estado ? oneOf(req.query.estado, 'estado', ESTADOS_PEDIDO) : null;
    const prioridad = req.query.prioridad ? oneOf(req.query.prioridad, 'prioridad', PRIORIDADES) : null;
    const idCliente = req.query.id_cliente ? int(req.query.id_cliente, 'id_cliente') : null;
    const limite = Math.min(int(req.query.limite, 'limite', { required: false, min: 1 }) || 200, 1000);

    const rows = await this.pedidoService.obtenerPedidos({
      estado,
      prioridad,
      id_cliente: idCliente,
      limite,
    });
    res.json(rows);
  };

  getById = async (req, res) => {
    const id = int(req.params.id, 'id');
    const row = await this.pedidoService.obtenerPedidoPorId(id);
    res.json(row);
  };

  create = async (req, res) => {
    const b = req.body;
    const idColab = req.user.id_colaborador;

    const cab = {
      id_cliente: int(b.id_cliente, 'id_cliente'),
      prioridad: oneOf(b.prioridad || 'BAJA', 'prioridad', PRIORIDADES),
      fecha_requerida: date(b.fecha_requerida, 'fecha_requerida'),
      observacion: str(b.observacion, 'observacion', { required: false, max: 2000 }),
      id_colaborador_solicita: idColab,
    };

    const pedido = await this.pedidoService.crearPedido(cab, b.lineas);
    res.status(201).json(pedido);
  };

  update = async (req, res) => {
    const id = int(req.params.id, 'id');
    const fields = {};
    if (req.body.prioridad !== undefined) {
      fields.prioridad = oneOf(req.body.prioridad, 'prioridad', PRIORIDADES);
    }
    if (req.body.fecha_requerida !== undefined) {
      fields.fecha_requerida = date(req.body.fecha_requerida, 'fecha_requerida');
    }
    if (req.body.observacion !== undefined) {
      fields.observacion = str(req.body.observacion, 'observacion', { required: false, max: 2000 });
    }

    const row = await this.pedidoService.actualizarPedido(id, fields);
    res.json(row);
  };

  agregarLinea = async (req, res) => {
    const id = int(req.params.id, 'id');
    const linea = await this.pedidoService.agregarLinea(id, req.body);
    res.status(201).json(linea);
  };

  marcarEntregado = async (req, res) => {
    const id = int(req.params.id, 'id');
    const row = await this.pedidoService.marcarEntregado(id, req.user.id_colaborador);
    res.json(row);
  };

  deletePedido = async (req, res) => {
    const id = int(req.params.id, 'id');
    await this.pedidoService.eliminarPedido(id);
    res.status(204).end();
  };

  deleteLinea = async (req, res) => {
    const id = int(req.params.id, 'id');
    await this.pedidoService.eliminarLinea(id);
    res.status(204).end();
  };

  /**
   * PATCH /detalles/:id  { cantidad?, observacion?, motivo? }
   * La cantidad se cambia con ajuste de stock e historial; notifica a Marketing y Producción.
   */
  updateLinea = async (req, res) => {
    const id = int(req.params.id, 'id');
    const fields = {};
    if (req.body.cantidad !== undefined) fields.cantidad = int(req.body.cantidad, 'cantidad', { min: 1 });
    if (req.body.observacion !== undefined) {
      fields.observacion = str(req.body.observacion, 'observacion', { required: false, max: 2000 });
    }
    fields.motivo = str(req.body.motivo, 'motivo', { required: false, max: 500 });
    const linea = await this.pedidoService.actualizarLinea(id, fields, req.user.id_colaborador);
    res.json(linea);
  };

  /** GET /detalles/:id/ediciones  historial de cambios de cantidad */
  getEdiciones = async (req, res) => {
    res.json(await this.pedidoService.obtenerEdiciones({ idDetalle: int(req.params.id, 'id') }));
  };
}
