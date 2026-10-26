import { HttpError } from '../utils/http-error.js';

export default class VinilService {
  constructor(vinilRepository) {
    this.vinilRepository = vinilRepository;
  }

  async obtenerTodos({ soloActivos = false } = {}) {
    return this.vinilRepository.findAll({ soloActivos });
  }

  async obtenerPorId(id) {
    const vinil = await this.vinilRepository.findById(id);
    if (!vinil) throw new HttpError(404, 'Vinil no encontrado.');
    return vinil;
  }

  async crear(data) {
    return this.vinilRepository.create(data);
  }

  async actualizar(id, data) {
    const vinil = await this.vinilRepository.update(id, data);
    if (!vinil) throw new HttpError(404, 'Vinil no encontrado.');
    return vinil;
  }

  async eliminar(id) {
    try {
      const eliminado = await this.vinilRepository.delete(id);
      if (!eliminado) throw new HttpError(404, 'Vinil no encontrado.');
      return true;
    } catch (err) {
      if (err.code === '23503') {
        throw new HttpError(409, 'Está en uso en pedidos o señales. Desactívalo en lugar de eliminarlo.');
      }
      throw err;
    }
  }
}

