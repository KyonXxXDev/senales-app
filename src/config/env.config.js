import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env'), quiet: true });

const lista = (v, def = []) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : def);
const json = (v, def) => {
  if (!v) return def;
  try { return JSON.parse(v); } catch {
    console.warn('[config] JSON inválido en variable de entorno; se usa el valor por defecto.');
    return def;
  }
};

// ── Servidor ───────────────────────────────────────────────────────────────
export const PORT = Number(process.env.PORT || 9001);
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const PGTZ = process.env.APP_TIMEZONE || process.env.PGTZ || 'America/Lima';

// ── Autenticación ──────────────────────────────────────────────────────────
// AUTH_MODE=erp   -> sesión única con el ERP (token del ERP, sin login propio)
// AUTH_MODE=local -> selector de colaborador propio (desarrollo / uso aislado)
export const AUTH_MODE = (process.env.AUTH_MODE || 'local').toLowerCase() === 'erp' ? 'erp' : 'local';

// Secreto para los tokens del modo local
export const SECRET_KEY = process.env.SECRET_KEY || 'cambia_esta_clave_en_produccion';
if (AUTH_MODE === 'local' && NODE_ENV === 'production' && !process.env.SECRET_KEY) {
  console.warn('⚠ SECRET_KEY no definido en producción.');
}

// ── Integración ERP (RRHH + Inventario) ────────────────────────────────────
// URL interna del backend del ERP (dentro de la red de Docker): http://erp-backend:9000/api/v1
export const ERP_API_URL = (process.env.ERP_API_URL || '').replace(/\/+$/, '');
// MISMO valor que SECRET_KEY del backend del ERP (firma los access_token)
export const ERP_JWT_SECRET = process.env.ERP_JWT_SECRET || '';
// Cuenta de servicio del ERP (rol LOGISTICA o ADMIN) para leer inventario y empleados
export const ERP_SERVICE_USER = process.env.ERP_SERVICE_USER || '';
export const ERP_SERVICE_PASSWORD = process.env.ERP_SERVICE_PASSWORD || '';
// Rutas que ve el NAVEGADOR (relativas al mismo dominio del ERP, detrás de nginx)
export const ERP_PUBLIC_API_URL = (process.env.ERP_PUBLIC_API_URL || '/api/v1').replace(/\/+$/, '');
export const ERP_LOGIN_URL = process.env.ERP_LOGIN_URL || '/login';
export const ERP_INVENTARIO_URL = process.env.ERP_INVENTARIO_URL || '/inventory/movements';
export const ERP_TIMEOUT_MS = Number(process.env.ERP_TIMEOUT_MS || 8000);

// Roles del ERP con acceso total aquí
export const ERP_ROLES_ADMIN = lista(process.env.ERP_ROLES_ADMIN, ['ADMIN', 'GERENTE', 'TI']).map((r) => r.toUpperCase());
// Roles del ERP que pueden marcar consumos como registrados en el inventario
export const ERP_ROLES_LOGISTICA = lista(process.env.ERP_ROLES_LOGISTICA, ['LOGISTICA']).map((r) => r.toUpperCase());

// Cómo se traduce el área del ERP (area_name o area_id) a las áreas de este sistema.
// Se compara sin tildes ni mayúsculas y basta con que el nombre CONTENGA el texto.
export const ERP_MAPEO_AREAS = json(process.env.ERP_MAPEO_AREAS, {
  OPERACIONES: ['OPERACION'],
  MARKETING: ['MARKETING'],
  PRODUCCION: ['PRODUCCION', 'PLANTA', 'TALLER'],
});
export const ERP_MAPEO_AREA_IDS = json(process.env.ERP_MAPEO_AREA_IDS, {}); // { "MARKETING": [4], ... }

// ── PostgreSQL ─────────────────────────────────────────────────────────────
export const DB_HOST = process.env.DB_HOST || process.env.PGHOST || 'localhost';
export const DB_PORT = Number(process.env.DB_PORT || process.env.PGPORT || 5432);
export const DB_NAME = process.env.DB_NAME || process.env.PGDATABASE || 'senales';
export const DB_USER = process.env.DB_USER || process.env.PGUSER || 'postgres';
export const DB_PASSWORD = String(process.env.DB_PASSWORD ?? process.env.PGPASSWORD ?? '');
export const DB_POOL_MAX = Number(process.env.DB_POOL_MAX || 10);
export const DB_SSL = process.env.DB_SSL === 'true';

// ── CORS / iframe ──────────────────────────────────────────────────────────
// Si la app se sirve en el mismo dominio que el ERP (recomendado), no hace falta tocar esto.
export const ACCEPTED_ORIGINS = lista(process.env.ACCEPTED_ORIGINS);
// Orígenes que pueden mostrar esta app dentro de un iframe (además del propio)
export const FRAME_ANCESTORS = lista(process.env.FRAME_ANCESTORS);

// ── SharePoint / Microsoft Graph ───────────────────────────────────────────
export const SP_CLIENT_ID = process.env.CLIENT_ID || '';
export const SP_TENANT_ID = process.env.TENANT_ID || '';
export const SP_CLIENT_SECRET = process.env.CLIENT_SECRET || '';
export const SP_SITE_ID = process.env.SHAREPOINT_SITE_ID || '';
export const SP_DRIVE_ID = process.env.SHAREPOINT_DRIVE_ID || '';
export const SP_FOLDER_GENERAL = process.env.SHAREPOINT_FOLDER_GENERAL || 'Senales';
