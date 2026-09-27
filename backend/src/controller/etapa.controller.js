import { int, oneOf } from '../utils/validators.js';

const AREAS = ['MARKETING', 'PRODUCCION'];

export default class EtapaController {
  constructor(etapaService) {
    this.etapaService = etapaService;
  }

  getAll = async (req, res) => {
    const rows = await this.etapaService.obtenerTodas();
    res.json(rows);
  };

  getByArea = async (req, res) => {
    const area = oneOf(req.params.area, 'area', AREAS);
    const rows = await this.etapaService.obtenerPorArea(area);
    res.json(rows);
  };

  getById = async (req, res) => {
    const id = int(req.params.id, 'id');
    const row = await this.etapaService.obtenerPorId(id);
    res.json(row);
  };
}

