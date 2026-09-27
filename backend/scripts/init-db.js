'use strict';
/**
 * Crea la base de datos (si no existe) y carga el esquema.
 *   npm run db:init           -> esquema + catálogos base (materiales, viniles, etapas)
 *   npm run db:init -- --demo -> además carga datos de ejemplo
 *   npm run db:init -- --reset [--demo] -> BORRA todo y vuelve a crear
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const DEMO = args.includes('--demo');
const RESET = args.includes('--reset');
const sqlDir = path.join(__dirname, '..', 'sql');

function config(database) {
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    if (database) url.pathname = '/' + database;
    return {
      connectionString: url.toString(),
      ...(process.env.DB_PASSWORD || process.env.PGPASSWORD
        ? { password: String(process.env.DB_PASSWORD || process.env.PGPASSWORD) }
        : {}),
    };
  }
  const password = process.env.DB_PASSWORD ?? process.env.PGPASSWORD;
  return {
    host: process.env.DB_HOST || process.env.PGHOST || 'localhost',
    port: Number(process.env.DB_PORT || process.env.PGPORT || 5432),
    user: process.env.DB_USER || process.env.PGUSER || 'postgres',
    database: database || process.env.DB_NAME || process.env.PGDATABASE || 'senales',
    ...(password !== undefined ? { password: String(password) } : {}),
  };
}

function nombreBD() {
  if (process.env.DATABASE_URL) return decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1));
  return process.env.PGDATABASE || 'senales';
}

async function main() {
  const db = nombreBD();

  // 1. Crear la BD si no existe
  const admin = new Client(config('postgres'));
  await admin.connect();
  const existe = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [db]);
  if (!existe.rows.length) {
    await admin.query(`CREATE DATABASE "${db.replace(/"/g, '""')}"`);
    console.log(`✔ Base de datos "${db}" creada`);
  }
  await admin.end();

  // 2. Cargar esquema
  const c = new Client(config(db));
  await c.connect();
  await c.query(`ALTER DATABASE "${db.replace(/"/g, '""')}" SET timezone = '${process.env.APP_TIMEZONE || 'America/Lima'}'`);

  if (RESET) {
    await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    console.log('✔ Esquema anterior eliminado');
  }
  const ya = await c.query("SELECT to_regclass('public.pedido') IS NOT NULL AS hay");
  if (ya.rows[0].hay) {
    console.log('ℹ El esquema ya existe. Usa --reset para recrearlo (borra los datos).');
    await c.end();
    return;
  }

  await c.query(fs.readFileSync(path.join(sqlDir, '01_esquema.sql'), 'utf8'));
  console.log('✔ Esquema, reglas y vistas creados');

  if (DEMO) {
    await c.query(fs.readFileSync(path.join(sqlDir, '02_datos_ejemplo.sql'), 'utf8'));
    console.log('✔ Datos de ejemplo cargados');
  } else {
    await c.query(fs.readFileSync(path.join(sqlDir, '00_catalogos_base.sql'), 'utf8'));
    console.log('✔ Catálogos base cargados (materiales, viniles, etapas)');
  }
  await c.end();
}

main().catch((e) => {
  console.error('✖ Error:', e.message);
  process.exit(1);
});
