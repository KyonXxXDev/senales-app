/**
 * Identidad: convierte el token (del ERP o local) en un colaborador de este sistema.
 *
 * Modo ERP: el usuario inicia sesión en el ERP; aquí llega su access_token.
 *   - Se busca/crea el colaborador enlazado (erp_user_id / employee_id).
 *   - El área se deduce del área del empleado en RRHH (ERP_MAPEO_AREAS),
 *     salvo que un administrador la haya fijado aquí (area_fija).
 *   - El nombre completo se toma del catálogo de empleados del ERP.
 */
import {
  ERP_MAPEO_AREA_IDS,
  ERP_MAPEO_AREAS,
  ERP_ROLES_ADMIN,
  ERP_ROLES_LOGISTICA,
} from '../config/env.config.js';
import { HttpError } from '../utils/http-error.js';

const AREAS = ['OPERACIONES', 'MARKETING', 'PRODUCCION'];
const normalizar = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

/** Área de este sistema para un área del ERP (o null si no hay equivalente) */
export function mapearArea(areaNombre, areaId) {
  if (areaId !== undefined && areaId !== null) {
    for (const [area, ids] of Object.entries(ERP_MAPEO_AREA_IDS || {})) {
      if (AREAS.includes(area) && (ids || []).map(String).includes(String(areaId))) return area;
    }
  }
  const n = normalizar(areaNombre);
  if (!n) return null;
  for (const [area, claves] of Object.entries(ERP_MAPEO_AREAS || {})) {
    if (!AREAS.includes(area)) continue;
    if ((claves || []).some((c) => n.includes(normalizar(c)))) return area;
  }
  return null;
}

const CACHE_MS = 2 * 60_000;

export default class IdentidadService {
  /**
   * @param {import('pg').Pool} db
   * @param {import('../integrations/erp.client.js').ErpClient} erpClient
   */
  constructor(db, erpClient) {
    this.db = db;
    this.erp = erpClient;
    this.cache = new Map(); // clave -> { usuario, vence }
  }

  #aUsuario(c, extra = {}) {
    return {
      id_colaborador: c.id_colaborador,
      nombre: c.nombre,
      area: c.activo ? c.area : null,
      es_admin: Boolean(c.es_admin) && c.activo,
      es_logistica: false,
      origen: c.origen || 'LOCAL',
      email: c.email || null,
      ...extra,
    };
  }

  invalidar() {
    this.cache.clear();
  }

  // ── Modo local ────────────────────────────────────────────────────────────
  async desdeTokenLocal(payload) {
    const id = Number(payload?.id_colaborador);
    if (!id) throw new HttpError(401, 'Token sin colaborador.');
    const clave = `L:${id}`;
    const hit = this.cache.get(clave);
    if (hit && hit.vence > Date.now()) return hit.usuario;

    const { rows } = await this.db.query('SELECT * FROM colaborador WHERE id_colaborador = $1', [id]);
    const c = rows[0];
    if (!c || !c.activo) throw new HttpError(401, 'El colaborador ya no está activo.');
    const usuario = this.#aUsuario(c, { es_logistica: Boolean(c.es_admin) });
    this.cache.set(clave, { usuario, vence: Date.now() + CACHE_MS });
    return usuario;
  }

  // ── Modo ERP ──────────────────────────────────────────────────────────────
  async desdeTokenErp(payload, tokenOriginal) {
    const userId = payload?.id || null;
    const employeeId = payload?.employee_id || null;
    if (!userId && !employeeId) throw new HttpError(401, 'El token del ERP no identifica al usuario.');

    const rol = String(payload.role_name || payload.role || '').toUpperCase();
    const clave = `E:${userId || employeeId}:${rol}:${payload.area_id ?? ''}`;
    const hit = this.cache.get(clave);
    if (hit && hit.vence > Date.now()) return hit.usuario;

    const c = await this.provisionar(payload, tokenOriginal);
    const usuario = this.#aUsuario(c, {
      es_admin: (Boolean(c.es_admin) || ERP_ROLES_ADMIN.includes(rol)) && c.activo,
      es_logistica: ERP_ROLES_LOGISTICA.includes(rol),
      rol_erp: rol || null,
      employee_id: employeeId,
      erp_user_id: userId,
      erp_area: payload.area_name || null,
    });
    this.cache.set(clave, { usuario, vence: Date.now() + CACHE_MS });
    return usuario;
  }

  /** Busca o crea el colaborador enlazado al usuario del ERP y refresca sus datos */
  async provisionar(payload, tokenUsuario = null) {
    const userId = payload.id || null;
    const employeeId = payload.employee_id || null;
    const rol = String(payload.role_name || payload.role || '').toUpperCase() || null;

    // Datos del empleado (nombre completo, código, cargo) desde RRHH
    let emp = null;
    if (employeeId && this.erp?.configurado) {
      try { emp = await this.erp.empleado(employeeId, { tokenUsuario }); } catch (e) {
        console.warn('[identidad] No se pudo leer el empleado del ERP:', e.message);
      }
    }
    const nombre = (emp?.full_name || '').replace(/\s+/g, ' ').trim()
      || payload.username || payload.email || 'Usuario ERP';
    const areaNombre = emp?.area_name || payload.area_name || null;
    const areaId = emp?.area_id ?? payload.area_id ?? null;
    const area = mapearArea(areaNombre, areaId);

    const { rows } = await this.db.query(
      `SELECT * FROM colaborador
        WHERE ($1::uuid IS NOT NULL AND erp_user_id = $1::uuid)
           OR ($2::uuid IS NOT NULL AND employee_id = $2::uuid)
        ORDER BY (erp_user_id = $1::uuid) DESC NULLS LAST
        LIMIT 1`,
      [userId, employeeId]
    );

    if (!rows.length) {
      const ins = await this.db.query(
        `INSERT INTO colaborador (nombre, area, activo, origen, employee_id, erp_user_id, erp_username, email,
                                  erp_codigo, erp_area, erp_cargo, erp_rol, ultima_sincronizacion)
         VALUES ($1, $2, TRUE, 'ERP', $3, $4, $5, $6, $7, $8, $9, $10, now())
         ON CONFLICT DO NOTHING
         RETURNING *`,
        [nombre.slice(0, 120), area, employeeId, userId, payload.username || null, payload.email || null,
          emp?.code || null, areaNombre, emp?.position_name || null, rol]
      );
      if (ins.rows[0]) return ins.rows[0];
      // otro request lo creó al mismo tiempo
      return this.provisionar(payload, tokenUsuario);
    }

    const actual = rows[0];
    const upd = await this.db.query(
      `UPDATE colaborador
          SET nombre = $2,
              area = CASE WHEN area_fija THEN area ELSE $3 END,
              origen = 'ERP',
              employee_id = COALESCE($4::uuid, employee_id),
              erp_user_id = COALESCE($5::uuid, erp_user_id),
              erp_username = COALESCE($6, erp_username),
              email = COALESCE($7, email),
              erp_codigo = COALESCE($8, erp_codigo),
              erp_area = $9,
              erp_cargo = COALESCE($10, erp_cargo),
              erp_rol = $11,
              activo = CASE WHEN $12::boolean IS NULL THEN activo ELSE $12::boolean END,
              ultima_sincronizacion = now()
        WHERE id_colaborador = $1
        RETURNING *`,
      [actual.id_colaborador, nombre.slice(0, 120), area, employeeId, userId, payload.username || null,
        payload.email || null, emp?.code || null, areaNombre, emp?.position_name || null, rol,
        emp ? emp.is_active !== false : null]
    );
    return upd.rows[0];
  }

  /**
   * Trae todos los empleados del ERP cuyas áreas tienen equivalente aquí
   * (para que aparezcan como responsables antes de su primer ingreso).
   */
  async sincronizarEmpleados({ tokenUsuario } = {}) {
    if (!this.erp?.configurado) throw new HttpError(503, 'La integración con el ERP no está configurada.');
    this.erp.limpiarCache();
    const empleados = await this.erp.empleados({ tokenUsuario });
    const res = { revisados: empleados.length, creados: 0, actualizados: 0, desactivados: 0, omitidos: 0 };

    for (const e of empleados) {
      const area = mapearArea(e.area_name, e.area_id);
      const nombre = (e.full_name || '').replace(/\s+/g, ' ').trim().slice(0, 120);
      if (!nombre) { res.omitidos++; continue; }
      const { rows } = await this.db.query('SELECT id_colaborador FROM colaborador WHERE employee_id = $1', [e.id]);
      if (rows.length) {
        await this.db.query(
          `UPDATE colaborador SET nombre = $2, area = CASE WHEN area_fija THEN area ELSE $3 END,
                  erp_codigo = $4, erp_area = $5, erp_cargo = $6, email = COALESCE($7, email),
                  activo = $8, origen = 'ERP', ultima_sincronizacion = now()
            WHERE employee_id = $1`,
          [e.id, nombre, area, e.code || null, e.area_name || null, e.position_name || null,
            e.email || null, e.is_active !== false]
        );
        if (e.is_active === false) res.desactivados++; else res.actualizados++;
      } else if (area && e.is_active !== false) {
        await this.db.query(
          `INSERT INTO colaborador (nombre, area, activo, origen, employee_id, erp_codigo, erp_area, erp_cargo,
                                    email, ultima_sincronizacion)
           VALUES ($1, $2, TRUE, 'ERP', $3, $4, $5, $6, $7, now())
           ON CONFLICT DO NOTHING`,
          [nombre, area, e.id, e.code || null, e.area_name || null, e.position_name || null, e.email || null]
        );
        res.creados++;
      } else {
        res.omitidos++;
      }
    }
    this.invalidar();
    return res;
  }
}
