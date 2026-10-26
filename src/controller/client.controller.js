import { int, str } from '../utils/validators.js';

export default class ClientController {
  constructor(clienteService) {
    this.clienteService = clienteService;
  }

  getAll = async (req, res) => {
    const soloActivos = req.query.activos === '1';
    const rows = await this.clienteService.obtenerTodos({ soloActivos });
    res.json(rows);
  };

  getById = async (req, res) => {
    const id = int(req.params.id, 'id');
    const row = await this.clienteService.obtenerPorId(id);
    res.json(row);
  };

  create = async (req, res) => {
    const data = {
      nombre: str(req.body.nombre, 'nombre', { max: 120 }),
      activo: req.body.activo !== undefined ? Boolean(req.body.activo) : true,
    };
    const row = await this.clienteService.crear(data);
    res.status(201).json(row);
  };

  update = async (req, res) => {
    const id = int(req.params.id, 'id');
    const data = {};
    if (req.body.nombre !== undefined) data.nombre = str(req.body.nombre, 'nombre', { max: 120 });
    if (req.body.activo !== undefined) data.activo = Boolean(req.body.activo);

    const row = await this.clienteService.actualizar(id, data);
    res.json(row);
  };

  delete = async (req, res) => {
    const id = int(req.params.id, 'id');
    await this.clienteService.eliminar(id);
    res.status(204).end();
  };
}

