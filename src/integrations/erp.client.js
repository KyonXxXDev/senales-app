/**
 * Cliente HTTP del ERP (microservicio RRHH + Inventario).
 *
 * - Habla con el backend del ERP por la red interna (ERP_API_URL).
 * - Usa una cuenta de servicio (ERP_SERVICE_USER / ERP_SERVICE_PASSWORD) para
 *   leer inventario y empleados; si no está configurada, reenvía el token del
 *   usuario que hizo la petición (funciona si su rol en el ERP lo permite).
 * - Renueva el token de servicio solo cuando vence o el ERP responde 401.
 */
import {
  ERP_API_URL,
  ERP_SERVICE_PASSWORD,
  ERP_SERVICE_USER,
  ERP_TIMEOUT_MS,
} from '../config/env.config.js';
import { HttpError } from '../utils/http-error.js';

function decodificarExp(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return Number(payload.exp || 0) * 1000;
  } catch {
    return 0;
  }
}

/** Las listas del ERP llegan como arreglo o como { data: [...] } */
const comoLista = (r) => (Array.isArray(r) ? r : Array.isArray(r?.data) ? r.data : []);

export class ErpClient {
  constructor({ baseUrl = ERP_API_URL, usuario = ERP_SERVICE_USER, clave = ERP_SERVICE_PASSWORD, timeoutMs = ERP_TIMEOUT_MS } = {}) {
    this.baseUrl = baseUrl;
    this.usuario = usuario;
    this.clave = clave;
    this.timeoutMs = timeoutMs;
    this.token = null;
    this.tokenVence = 0;
    this.margen = 60_000;
    this.login = null; // promesa compartida para no hacer logins simultáneos
    this.cache = new Map();
  }

  get configurado() {
    return Boolean(this.baseUrl);
  }

  get tieneCuentaServicio() {
    return Boolean(this.usuario && this.clave);
  }

  async #fetch(path, { method = 'GET', body, token } = {}) {
    if (!this.baseUrl) throw new HttpError(503, 'La integración con el ERP no está configurada (ERP_API_URL).');
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(this.baseUrl + path, {
        method,
        headers: {
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      let data = null;
      const texto = await res.text();
      if (texto) {
        try { data = JSON.parse(texto); } catch { data = { message: texto.slice(0, 200) }; }
      }
      return { status: res.status, ok: res.ok, data };
    } catch (err) {
      const motivo = err.name === 'AbortError' ? `no respondió en ${this.timeoutMs} ms` : err.message;
      throw new HttpError(502, `No se pudo conectar con el ERP: ${motivo}`);
    } finally {
      clearTimeout(t);
    }
  }

  async #tokenServicio({ forzar = false } = {}) {
    if (!this.tieneCuentaServicio) return null;
    if (!forzar && this.token && Date.now() < this.tokenVence - this.margen) return this.token;
    if (!this.login) {
      this.login = (async () => {
        const r = await this.#fetch('/auth/login', {
          method: 'POST',
          body: { account: this.usuario, password: this.clave },
        });
        if (!r.ok || !r.data?.token) {
          throw new HttpError(502, `El ERP rechazó la cuenta de servicio: ${r.data?.message || r.status}`);
        }
        this.token = r.data.token;
        this.tokenVence = decodificarExp(this.token) || Date.now() + 50 * 60_000;
        // renovar un poco antes de que venza (máx. 1 min, o 1/4 de la vida del token)
        this.margen = Math.min(60_000, Math.max(0, (this.tokenVence - Date.now()) / 4));
        return this.token;
      })().finally(() => { this.login = null; });
    }
    return this.login;
  }

  /**
   * GET autenticado. tokenUsuario se usa si no hay cuenta de servicio.
   */
  async get(path, { tokenUsuario = null } = {}) {
    let token = (await this.#tokenServicio()) || tokenUsuario;
    let r = await this.#fetch(path, { token });
    if (r.status === 401 && this.tieneCuentaServicio) {
      token = await this.#tokenServicio({ forzar: true });
      r = await this.#fetch(path, { token });
    }
    if (r.status === 401 || r.status === 403) {
      throw new HttpError(r.status === 401 ? 502 : 403,
        `El ERP no autorizó la consulta (${r.data?.message || r.status}). Revisa la cuenta de servicio y su rol.`);
    }
    if (!r.ok) throw new HttpError(502, `El ERP respondió ${r.status}: ${r.data?.message || r.data?.error || 'error'}`);
    return r.data;
  }

  async #cacheado(clave, ms, fn) {
    const hit = this.cache.get(clave);
    if (hit && hit.vence > Date.now()) return hit.valor;
    const valor = await fn();
    this.cache.set(clave, { valor, vence: Date.now() + ms });
    return valor;
  }

  limpiarCache() {
    this.cache.clear();
  }

  // ── RRHH ──────────────────────────────────────────────────────────────────
  /** Catálogo de empleados: id, code, full_name, email, area_id, area_name, position_name, is_active */
  async empleados({ tokenUsuario } = {}) {
    return this.#cacheado('empleados', 10 * 60_000,
      async () => comoLista(await this.get('/employees/catalog', { tokenUsuario })));
  }

  async empleado(employeeId, opts) {
    const lista = await this.empleados(opts);
    return lista.find((e) => String(e.id) === String(employeeId)) || null;
  }

  // ── Inventario ────────────────────────────────────────────────────────────
  async productos({ q = '', limite = 30, tokenUsuario } = {}) {
    const qs = new URLSearchParams({ page: '1', limit: String(limite) });
    if (q) qs.set('search', q);
    return comoLista(await this.get(`/products?${qs}`, { tokenUsuario }));
  }

  async producto(id, { tokenUsuario } = {}) {
    return this.get(`/products/${encodeURIComponent(id)}`, { tokenUsuario });
  }

  /** Stock por almacén de un producto (el ERP filtra por product_id dentro de "search") */
  async stockProducto(productId, { tokenUsuario } = {}) {
    return this.#cacheado(`stock:${productId}`, 60_000, async () => {
      const qs = new URLSearchParams({ page: '1', limit: '100', search: productId });
      const filas = comoLista(await this.get(`/inventory-stocks?${qs}`, { tokenUsuario }));
      return filas.filter((s) => String(s.product_id) === String(productId));
    });
  }

  async almacenes({ tokenUsuario } = {}) {
    return this.#cacheado('almacenes', 10 * 60_000,
      async () => comoLista(await this.get('/warehouses/catalog', { tokenUsuario })));
  }

  /** Comprueba que el ERP responde (su /health está fuera de /api/v1) */
  async salud() {
    if (!this.baseUrl) return { ok: false, motivo: 'ERP_API_URL vacío' };
    const raiz = this.baseUrl.replace(/\/api\/v\d+$/, '');
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    try {
      const r = await fetch(`${raiz}/health`, { signal: ctrl.signal });
      return { ok: r.ok, status: r.status };
    } catch (e) {
      return { ok: false, motivo: e.name === 'AbortError' ? 'sin respuesta' : e.message };
    } finally {
      clearTimeout(t);
    }
  }
}

export const erpClient = new ErpClient();
export default erpClient;
