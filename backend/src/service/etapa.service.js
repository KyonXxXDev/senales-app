import { HttpError } from '../utils/http-error.js';

export default class EtapaService {
  constructor(etapaRepository) {
    this.etapaRepository = etapaRepository;
  }

  async obtenerTodas() {
    return this.etapaRepository.findAll();
  }

  async obtenerPorArea(area) {
    return this.etapaRepository.findByArea(area);
  }

  async obtenerPorId(id) {
    const etapa = await this.etapaRepository.findById(id);
    if (!etapa) throw new HttpError(404, 'Etapa no encontrada.');
    return etapa;
  }
}

