import { HttpError } from '../utils/http-error.js';

export default class ColaboradorService {
  constructor(colaboradorRepository) {
    this.colaboradorRepository = colaboradorRepository;
  }

  async obtenerTodos({ soloActivos = false } = {}) {
    return this.colaboradorRepository.findAll({ soloActivos });
  }

  async obtenerPorId(id) {
    const colaborador = await this.colaboradorRepository.findById(id);
    if (!colaborador) throw new HttpError(404, 'Colaborador no encontrado.');
    return colaborador;
  }

  async crear(data) {
    return this.colaboradorRepository.create(data);
  }

  async actualizar(id, data) {
    const colaborador = await this.colaboradorRepository.update(id, data);
    if (!colaborador) throw new HttpError(404, 'Colaborador no encontrado.');
    return colaborador;
  }

  async eliminar(id) {
    try {
      const eliminado = await this.colaboradorRepository.delete(id);
      if (!eliminado) throw new HttpError(404, 'Colaborador no encontrado.');
      return true;
    } catch (err) {
      if (err.code === '23503') {
        throw new HttpError(409, 'Está en uso en pedidos o señales. Desactívalo en lugar de eliminarlo.');
      }
      throw err;
    }
  }
}

