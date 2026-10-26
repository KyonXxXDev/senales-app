import {
  AUTH_MODE,
  ERP_INVENTARIO_URL,
  ERP_LOGIN_URL,
  ERP_PUBLIC_API_URL,
  SECRET_KEY,
} from '../config/env.config.js';
import { signJwt } from '../utils/jwt.js';
import { HttpError } from '../utils/http-error.js';
import { permisosDe } from '../utils/permisos.js';

export default class AuthService {
  constructor(authRepository) {
    this.authRepository = authRepository;
  }

  /** Lo que el frontend necesita saber antes de iniciar sesión */
  config() {
    return {
      modo: AUTH_MODE,
      erp: AUTH_MODE === 'erp'
        ? { api: ERP_PUBLIC_API_URL, login: ERP_LOGIN_URL, inventario: ERP_INVENTARIO_URL }
        : null,
    };
  }

  // ── Solo modo local ───────────────────────────────────────────────────────
  #soloLocal() {
    if (AUTH_MODE !== 'local') {
      throw new HttpError(404, 'El inicio de sesión se hace en el ERP.');
    }
  }

  async getActiveColaboradores() {
    this.#soloLocal();
    return this.authRepository.findActiveColaboradores();
  }

  async login({ id_colaborador } = {}) {
    this.#soloLocal();
    if (!id_colaborador) throw new HttpError(400, 'El colaborador es obligatorio para iniciar sesión.');

    const colab = await this.authRepository.findColaboradorById(id_colaborador);
    if (!colab) throw new HttpError(404, 'Colaborador no encontrado.');
    if (!colab.activo) throw new HttpError(403, 'El colaborador se encuentra inactivo.');

    const token = signJwt({ id_colaborador: colab.id_colaborador }, SECRET_KEY, { expiresInSeconds: 7 * 86400 });
    return { token, colaborador: colab };
  }

  // ── Ambos modos ───────────────────────────────────────────────────────────
  me(user) {
    if (!user) throw new HttpError(401, 'No autenticado.');
    return { ...user, permisos: permisosDe(user) };
  }
}
