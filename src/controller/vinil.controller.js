import { int, str } from '../utils/validators.js';

export default class VinilController {
  constructor(vinilService) {
    this.vinilService = vinilService;
  }

  getAll = async (req, res) => {
    const soloActivos = req.query.activos === '1';
    const rows = await this.vinilService.obtenerTodos({ soloActivos });
    res.json(rows);
  };

  getById = async (req, res) => {
    const id = int(req.params.id, 'id');
    const row = await this.vinilService.obtenerPorId(id);
    res.json(row);
  };

  create = async (req, res) => {
    const data = {
      nombre: str(req.body.nombre, 'nombre', { max: 120 }),
      activo: req.body.activo !== undefined ? Boolean(req.body.activo) : true,
    };
    const row = await this.vinilService.crear(data);
    res.status(201).json(row);
  };

  update = async (req, res) => {
    const id = int(req.params.id, 'id');
    const data = {};
    if (req.body.nombre !== undefined) data.nombre = str(req.body.nombre, 'nombre', { max: 120 });
    if (req.body.activo !== undefined) data.activo = Boolean(req.body.activo);

    const row = await this.vinilService.actualizar(id, data);
    res.json(row);
  };

  delete = async (req, res) => {
    const id = int(req.params.id, 'id');
    await this.vinilService.eliminar(id);
    res.status(204).end();
  };
}

