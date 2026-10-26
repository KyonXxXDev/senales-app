import { HttpError } from '../utils/http-error.js';

export default class MaterialService {
  constructor(materialRepository) {
    this.materialRepository = materialRepository;
  }

  async obtenerTodos({ soloActivos = false } = {}) {
    return this.materialRepository.findAll({ soloActivos });
  }

  async obtenerPorId(id) {
    const material = await this.materialRepository.findById(id);
    if (!material) throw new HttpError(404, 'Material no encontrado.');
    return material;
  }

  async crear(data) {
    return this.materialRepository.create(data);
  }

  async actualizar(id, data) {
    const material = await this.materialRepository.update(id, data);
    if (!material) throw new HttpError(404, 'Material no encontrado.');
    return material;
  }

  async eliminar(id) {
    try {
      const eliminado = await this.materialRepository.delete(id);
      if (!eliminado) throw new HttpError(404, 'Material no encontrado.');
      return true;
    } catch (err) {
      if (err.code === '23503') {
        throw new HttpError(409, 'Está en uso en pedidos o señales. Desactívalo en lugar de eliminarlo.');
      }
      throw err;
    }
  }
}

