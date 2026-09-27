import { int, num, str, oneOf } from '../utils/validators.js';

function leerSenal(body) {
  const ancho = num(body.ancho_cm, 'ancho_cm', { positive: true });
  const alto = num(body.alto_cm, 'alto_cm', { positive: true });
  const imgVal = body.imagen_referencial !== undefined ? body.imagen_referencial : body.imagen_url;
  return {
    nombre: str(body.nombre, 'nombre', { max: 150 }),
    id_material: int(body.id_material, 'id_material'),
    id_vinil: int(body.id_vinil, 'id_vinil'),
    ancho_cm: ancho,
    alto_cm: alto,
    imagen_referencial: imgVal ? str(imgVal, 'imagen_referencial', { required: false, max: 2000 }) : (imgVal === '' ? null : undefined),
  };
}

function obtenerArchivo(req) {
  if (req.file) return req.file;
  if (req.files) {
    if (req.files.imagen?.[0]) return req.files.imagen[0];
    if (req.files.file?.[0]) return req.files.file[0];
    if (req.files.photo?.[0]) return req.files.photo[0];
  }
  return null;
}

export default class SenalController {
  constructor(senalService) {
    this.senalService = senalService;
  }

  getAll = async (req, res) => {
    const soloActivos = req.query.activos === '1';
    const q = req.query.q ? String(req.query.q) : '';
    const rows = await this.senalService.obtenerTodas({ soloActivos, q });
    res.json(rows);
  };

  getById = async (req, res) => {
    const id = int(req.params.id, 'id');
    const row = await this.senalService.obtenerPorId(id);
    res.json(row);
  };

  create = async (req, res) => {
    const file = obtenerArchivo(req);
    const d = leerSenal(req.body);
    const stockInicial = int(req.body.stock_inicial, 'stock_inicial', { required: false, min: 0 }) || 0;
    const idColab = int(req.body.id_colaborador, 'id_colaborador', { required: false }) || req.user?.id_colaborador || null;

    const row = await this.senalService.crear(d, stockInicial, idColab, file);
    res.status(201).json(row);
  };

  update = async (req, res) => {
    const id = int(req.params.id, 'id');
    const file = obtenerArchivo(req);
    const d = leerSenal(req.body);
    const activo = req.body.activo === undefined ? true : Boolean(req.body.activo);
    const row = await this.senalService.actualizar(id, { ...d, activo }, file);
    res.json(row);
  };

  uploadSharepoint = async (req, res) => {
    const file = obtenerArchivo(req);
    if (!file) {
      return res.status(400).json({ error: 'No se ha enviado ningún archivo de imagen para subir a SharePoint.' });
    }
    const result = await this.senalService.subirArchivoSharePoint(file, req.body.nombre || 'senal');
    res.json({
      ok: true,
      url: result.webUrl,
      webUrl: result.webUrl,
      id: result.id,
      name: result.name,
    });
  };

  patchActivo = async (req, res) => {
    const id = int(req.params.id, 'id');
    const activo = Boolean(req.body.activo);
    const row = await this.senalService.cambiarActivo(id, activo);
    res.json(row);
  };

  getKardex = async (req, res) => {
    const id = int(req.params.id, 'id');
    const rows = await this.senalService.obtenerKardex(id);
    res.json(rows);
  };

  crearMovimientoStock = async (req, res) => {
    const tipo = oneOf(req.body.tipo, 'tipo', ['ENTRADA', 'AJUSTE']);
    const cantidad = int(req.body.cantidad, 'cantidad');
    const idColab = int(req.body.id_colaborador, 'id_colaborador', { required: false }) || req.user?.id_colaborador || null;
    const observacion = str(req.body.observacion, 'observacion', { required: false });

    const row = await this.senalService.registrarMovimientoManual({
      id_senal: int(req.body.id_senal, 'id_senal'),
      tipo,
      cantidad,
      id_colaborador: idColab,
      observacion,
    });
    res.status(201).json(row);
  };
}

