import { HttpError } from '../utils/http-error.js';

export default class ClienteService {
  constructor(clienteRepository) {
    this.clienteRepository = clienteRepository;
  }

  async obtenerTodos({ soloActivos = false } = {}) {
    return this.clienteRepository.findAll({ soloActivos });
  }

  async obtenerPorId(id) {
    const cliente = await this.clienteRepository.findById(id);
    if (!cliente) throw new HttpError(404, 'Cliente no encontrado.');
    return cliente;
  }

  async crear(data) {
    return this.clienteRepository.create(data);
  }

  async actualizar(id, data) {
    const cliente = await this.clienteRepository.update(id, data);
    if (!cliente) throw new HttpError(404, 'Cliente no encontrado.');
    return cliente;
  }

  async eliminar(id) {
    try {
      const eliminado = await this.clienteRepository.delete(id);
      if (!eliminado) throw new HttpError(404, 'Cliente no encontrado.');
      return true;
    } catch (err) {
      if (err.code === '23503') {
        throw new HttpError(409, 'Está en uso en pedidos o señales. Desactívalo en lugar de eliminarlo.');
      }
      throw err;
    }
  }
}

