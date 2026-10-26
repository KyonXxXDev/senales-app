/**
 * Base de datos de Señales
 *   npm run db:init      -> crea la BD si no existe, el esquema, catálogos base y aplica migraciones
 *   npm run db:migrate   -> aplica solo las migraciones pendientes (BD existente / producción)
 *   npm run db:demo      -> BORRA todo y crea con datos de ejemplo
 *
 * Las migraciones (sql/migraciones/NN_nombre.sql) se registran en la tabla
 * schema_migracion; cada una corre una sola vez y todas son idempotentes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const args = process.argv.slice(2);
const SOLO_MIGRAR = args.includes('--migrate');
const DEMO = args.includes('--demo');
const RESET = args.includes('--reset');
const sqlDir = path.join(__dirname, '..', 'sql');
const migDir = path.join(sqlDir, 'migraciones');

function config(database) {
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    if (database) url.pathname = '/' + database;
    return { connectionString: url.toString() };
  }
  const password = process.env.DB_PASSWORD ?? process.env.PGPASSWORD;
  return {
    host: process.env.DB_HOST || process.env.PGHOST || 'localhost',
    port: Number(process.env.DB_PORT || process.env.PGPORT || 5432),
    user: process.env.DB_USER || process.env.PGUSER || 'postgres',
    database: database || nombreBD(),
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    ...(password !== undefined ? { password: String(password) } : {}),
  };
}

function nombreBD() {
  if (process.env.DATABASE_URL) return decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1));
  return process.env.DB_NAME || process.env.PGDATABASE || 'senales';
}

const leer = (f) => fs.readFileSync(f, 'utf8');
const q = (s) => `"${s.replace(/"/g, '""')}"`;

async function aplicarMigraciones(c) {
  await c.query(`CREATE TABLE IF NOT EXISTS schema_migracion (
    version   VARCHAR(100) PRIMARY KEY,
    aplicada  TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  const { rows } = await c.query('SELECT version FROM schema_migracion');
  const hechas = new Set(rows.map((r) => r.version));
  const archivos = fs.readdirSync(migDir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  let n = 0;
  for (const f of archivos) {
    if (hechas.has(f)) continue;
    await c.query(leer(path.join(migDir, f)));
    await c.query('INSERT INTO schema_migracion (version) VALUES ($1)', [f]);
    console.log(`  ✔ migración ${f}`);
    n++;
  }
  console.log(n ? `✔ ${n} migración(es) aplicada(s)` : 'ℹ No hay migraciones pendientes');
}

async function main() {
  const db = nombreBD();

  if (!SOLO_MIGRAR) {
    try {
      const admin = new pg.Client(config('postgres'));
      await admin.connect();
      const existe = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [db]);
      if (!existe.rows.length) {
        await admin.query(`CREATE DATABASE ${q(db)}`);
        console.log(`✔ Base de datos "${db}" creada`);
      }
      await admin.end();
    } catch (e) {
      console.warn(`ℹ No se pudo verificar/crear la BD desde "postgres" (${e.message}). Se asume que "${db}" ya existe.`);
    }
  }

  const c = new pg.Client(config(db));
  await c.connect();
  try {
    await c.query(`ALTER DATABASE ${q(db)} SET timezone = '${(process.env.APP_TIMEZONE || 'America/Lima').replace(/'/g, '')}'`)
      .catch(() => {});

    if (RESET) {
      await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
      console.log('✔ Esquema anterior eliminado');
    }

    const { rows } = await c.query("SELECT to_regclass('public.pedido') IS NOT NULL AS hay");
    const existe = rows[0].hay;

    if (SOLO_MIGRAR) {
      if (!existe) throw new Error('La BD no tiene el esquema. Ejecuta primero "npm run db:init".');
      await aplicarMigraciones(c);
      return;
    }

    if (existe) {
      console.log('ℹ El esquema ya existe; solo se aplican migraciones pendientes (usa --reset para recrear).');
      await aplicarMigraciones(c);
      return;
    }

    await c.query(leer(path.join(sqlDir, '01_esquema.sql')));
    console.log('✔ Esquema base creado');
    await aplicarMigraciones(c);
    await c.query(leer(path.join(sqlDir, DEMO ? '02_datos_ejemplo.sql' : '00_catalogos_base.sql')));
    console.log(DEMO ? '✔ Datos de ejemplo cargados' : '✔ Catálogos base cargados');
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error('✖ Error:', e.message);
  process.exit(1);
});
