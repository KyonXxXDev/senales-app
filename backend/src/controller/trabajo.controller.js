import { int, str, oneOf, date } from '../utils/validators.js';

const AREAS = ['MARKETING', 'PRODUCCION'];

export default class TrabajoController {
  constructor(trabajoService) {
    this.trabajoService = trabajoService;
  }

  getBandeja = async (req, res) => {
    const area = oneOf(req.params.area, 'area', AREAS);
    const prioridad = req.query.prioridad ? oneOf(req.query.prioridad, 'prioridad', ['BAJA', 'MEDIA', 'ALTA']) : null;
    const terminados = req.query.terminados === '1';

    const rows = await this.trabajoService.obtenerBandeja(area, { prioridad, terminados });
    res.json(rows);
  };

  iniciarSesion = async (req, res) => {
    const b = req.body;
    const idDetalle = int(b.id_detalle_pedido, 'id_detalle_pedido');
    const idEtapa = int(b.id_etapa, 'id_etapa');
    const inicio = date(b.inicio, 'inicio');
    const fin = date(b.fin, 'fin');
    const cantidad = int(b.cantidad_procesada, 'cantidad_procesada', { required: false, min: 0 }) || 0;
    const idColab = int(b.id_colaborador, 'id_colaborador', { required: false }) || req.user?.id_colaborador || null;
    const observacion = str(b.observacion, 'observacion', { required: false });

    const registro = await this.trabajoService.iniciarSesion({
      id_detalle_pedido: idDetalle,
      id_etapa: idEtapa,
      id_colaborador: idColab,
      inicio,
      fin,
      cantidad_procesada: cantidad,
      observacion,
    });
    res.status(201).json(registro);
  };

  finalizarSesion = async (req, res) => {
    const id = int(req.params.id, 'id');
    const cantidad = int(req.body.cantidad_procesada, 'cantidad_procesada', { min: 0 });
    const observacion = str(req.body.observacion, 'observacion', { required: false });

    const registro = await this.trabajoService.finalizarSesion(id, cantidad, observacion);
    res.json(registro);
  };

  modificarSesion = async (req, res) => {
    const id = int(req.params.id, 'id');
    const b = req.body;
    const fields = {};

    if (b.inicio !== undefined) fields.inicio = date(b.inicio, 'inicio');
    if (b.fin !== undefined) fields.fin = b.fin === null ? null : date(b.fin, 'fin');
    if (b.cantidad_procesada !== undefined) fields.cantidad_procesada = int(b.cantidad_procesada, 'cantidad_procesada', { min: 0 });
    if (b.id_colaborador !== undefined) fields.id_colaborador = int(b.id_colaborador, 'id_colaborador', { required: false });
    if (b.id_etapa !== undefined) fields.id_etapa = int(b.id_etapa, 'id_etapa');
    if (b.observacion !== undefined) fields.observacion = str(b.observacion, 'observacion', { required: false });

    const registro = await this.trabajoService.modificarSesion(id, fields);
    res.json(registro);
  };

  eliminarSesion = async (req, res) => {
    const id = int(req.params.id, 'id');
    await this.trabajoService.eliminarSesion(id);
    res.status(204).end();
  };

  getHistorialLinea = async (req, res) => {
    const id = int(req.params.id, 'id');
    const rows = await this.trabajoService.obtenerHistorialLinea(id);
    res.json(rows);
  };
}

