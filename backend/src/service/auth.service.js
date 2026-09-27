import { SECRET_KEY } from '../config/env.config.js';
import { signJwt } from '../utils/jwt.js';
import { HttpError } from '../utils/http-error.js';

export default class AuthService {
  constructor(authRepository) {
    this.authRepository = authRepository;
  }

  async getActiveColaboradores() {
    return this.authRepository.findActiveColaboradores();
  }

  async login({ id_colaborador, pin } = {}) {
    if (!id_colaborador) {
      throw new HttpError(400, 'El colaborador es obligatorio para iniciar sesión.');
    }

    const colab = await this.authRepository.findColaboradorById(id_colaborador);
    if (!colab) {
      throw new HttpError(404, 'Colaborador no encontrado.');
    }

    if (!colab.activo) {
      throw new HttpError(403, 'El colaborador se encuentra inactivo.');
    }

    // Si en el futuro se configura un PIN o contraseña, se valida aquí
    if (pin && colab.pin && String(colab.pin) !== String(pin)) {
      throw new HttpError(401, 'PIN incorrecto.');
    }

    const payload = {
      id_colaborador: colab.id_colaborador,
      nombre: colab.nombre,
      area: colab.area,
    };

    // Sesión de 7 días (604800 segundos) para no interrumpir el flujo en talleres
    const token = signJwt(payload, SECRET_KEY, { expiresInSeconds: 7 * 86400 });

    return {
      token,
      colaborador: payload,
    };
  }

  async getMe(idColaborador) {
    if (!idColaborador) {
      throw new HttpError(401, 'No autenticado.');
    }
    const colab = await this.authRepository.findColaboradorById(idColaborador);
    if (!colab || !colab.activo) {
      throw new HttpError(404, 'Colaborador no encontrado o inactivo.');
    }
    return {
      id_colaborador: colab.id_colaborador,
      nombre: colab.nombre,
      area: colab.area,
    };
  }
}

