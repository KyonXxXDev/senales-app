import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

// ── Servidor ───────────────────────────────────────────────────────────────
export const PORT = Number(process.env.PORT || 9000);
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const PGTZ = process.env.APP_TIMEZONE || process.env.PGTZ || 'America/Lima';

// ── Seguridad / JWT ────────────────────────────────────────────────────────
export const SECRET_KEY = process.env.SECRET_KEY || 'default_secret_key_change_in_production_123456';
export const REFRESH_SECRET_KEY = process.env.REFRESH_SECRET_KEY || 'default_refresh_secret_key_123456';

// ── PostgreSQL ─────────────────────────────────────────────────────────────
export const DB_HOST = process.env.DB_HOST || process.env.PGHOST || 'localhost';
export const DB_PORT = Number(process.env.DB_PORT || process.env.PGPORT || 5432);
export const DB_NAME = process.env.DB_NAME || process.env.PGDATABASE || 'senales';
export const DB_USER = process.env.DB_USER || process.env.PGUSER || 'postgres';
export const DB_PASSWORD = String(process.env.DB_PASSWORD ?? process.env.PGPASSWORD ?? '');
export const DB_POOL_MAX = Number(process.env.DB_POOL_MAX || 10);

// ── CORS ───────────────────────────────────────────────────────────────────
export const ACCEPTED_ORIGINS = process.env.ACCEPTED_ORIGINS
  ? process.env.ACCEPTED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
  : ['*'];

// ── SharePoint / Microsoft Graph ───────────────────────────────────────────
export const SP_CLIENT_ID = process.env.CLIENT_ID || '';
export const SP_TENANT_ID = process.env.TENANT_ID || '';
export const SP_CLIENT_SECRET = process.env.CLIENT_SECRET || '';

export const SP_SITE_ID = process.env.SHAREPOINT_SITE_ID || '';
export const SP_DRIVE_ID = process.env.SHAREPOINT_DRIVE_ID || '';
export const SP_FOLDER_GENERAL = process.env.SHAREPOINT_FOLDER_GENERAL || 'Senales';

// Alias para compatibilidad
export const CLIENT_ID = SP_CLIENT_ID;
export const TENANT_ID = SP_TENANT_ID;
export const CLIENT_SECRET = SP_CLIENT_SECRET;
export const SHAREPOINT_SITE_ID = SP_SITE_ID;
export const SHAREPOINT_DRIVE_ID = SP_DRIVE_ID;
export const SHAREPOINT_LIST_ID = process.env.SHAREPOINT_LIST_ID || '';
export const SHAREPOINT_FOLDER_GENERAL = SP_FOLDER_GENERAL;