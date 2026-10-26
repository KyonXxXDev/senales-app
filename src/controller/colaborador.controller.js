import { int, str, oneOf } from '../utils/validators.js';
import { HttpError } from '../utils/http-error.js';
import { services } from '../config/module.factory.js';

const AREAS = ['OPERACIONES', 'MARKETING', 'PRODUCCION'];
const areaOpcional = (v) => (v === null || v === '' ? null : oneOf(v, 'area', AREAS));

export default class ColaboradorController {
  constructor(colaboradorService) {
    this.colaboradorService = colaboradorService;
  }

  getAll = async (req, res) => {
    const soloActivos = req.query.activos === '1';
    res.json(await this.colaboradorService.obtenerTodos({ soloActivos }));
  };

  getById = async (req, res) => {
    res.json(await this.colaboradorService.obtenerPorId(int(req.params.id, 'id')));
  };

  create = async (req, res) => {
    const data = {
      nombre: str(req.body.nombre, 'nombre', { max: 120 }),
      area: areaOpcional(req.body.area),
      activo: req.body.activo !== undefined ? Boolean(req.body.activo) : true,
      es_admin: Boolean(req.body.es_admin),
      email: str(req.body.email, 'email', { required: false, max: 180 }),
    };
    const row = await this.colaboradorService.crear(data);
    res.status(201).json(row);
  };

  update = async (req, res) => {
    const id = int(req.params.id, 'id');
    const actual = await this.colaboradorService.obtenerPorId(id);
    const data = {};
    if (req.body.nombre !== undefined) {
      if (actual.origen === 'ERP') throw new HttpError(409, 'El nombre de un colaborador del ERP se cambia en RRHH.');
      data.nombre = str(req.body.nombre, 'nombre', { max: 120 });
    }
    if (req.body.area !== undefined) {
      data.area = areaOpcional(req.body.area);
      // Si viene del ERP, el área elegida aquí manda sobre la de RRHH
      if (actual.origen === 'ERP') data.area_fija = true;
    }
    if (req.body.area_fija !== undefined) data.area_fija = Boolean(req.body.area_fija);
    if (req.body.activo !== undefined) data.activo = Boolean(req.body.activo);
    if (req.body.es_admin !== undefined) data.es_admin = Boolean(req.body.es_admin);
    if (req.body.email !== undefined) data.email = str(req.body.email, 'email', { required: false, max: 180 });
    if (!Object.keys(data).length) throw new HttpError(400, 'No hay campos para actualizar.');

    const row = await this.colaboradorService.actualizar(id, data);
    services.identidad.invalidar();
    res.json(row);
  };

  delete = async (req, res) => {
    await this.colaboradorService.eliminar(int(req.params.id, 'id'));
    services.identidad.invalidar();
    res.status(204).end();
  };
}
