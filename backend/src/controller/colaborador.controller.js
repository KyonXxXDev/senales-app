import { int, str, oneOf } from '../utils/validators.js';

const AREAS = ['OPERACIONES', 'MARKETING', 'PRODUCCION'];

export default class ColaboradorController {
  constructor(colaboradorService) {
    this.colaboradorService = colaboradorService;
  }

  getAll = async (req, res) => {
    const soloActivos = req.query.activos === '1';
    const rows = await this.colaboradorService.obtenerTodos({ soloActivos });
    res.json(rows);
  };

  getById = async (req, res) => {
    const id = int(req.params.id, 'id');
    const row = await this.colaboradorService.obtenerPorId(id);
    res.json(row);
  };

  create = async (req, res) => {
    const data = {
      nombre: str(req.body.nombre, 'nombre', { max: 120 }),
      area: oneOf(req.body.area, 'area', AREAS),
      activo: req.body.activo !== undefined ? Boolean(req.body.activo) : true,
    };
    const row = await this.colaboradorService.crear(data);
    res.status(201).json(row);
  };

  update = async (req, res) => {
    const id = int(req.params.id, 'id');
    const data = {};
    if (req.body.nombre !== undefined) data.nombre = str(req.body.nombre, 'nombre', { max: 120 });
    if (req.body.area !== undefined) data.area = oneOf(req.body.area, 'area', AREAS);
    if (req.body.activo !== undefined) data.activo = Boolean(req.body.activo);

    const row = await this.colaboradorService.actualizar(id, data);
    res.json(row);
  };

  delete = async (req, res) => {
    const id = int(req.params.id, 'id');
    await this.colaboradorService.eliminar(id);
    res.status(204).end();
  };
}

