'use strict';
import 'dotenv/config';
import { Pool, types } from 'pg';

// NUMERIC (1700) y BIGINT/COUNT (20) llegan como texto: convertir a número
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));
// DATE (1082) se deja como texto 'YYYY-MM-DD' para no correr zonas horarias
types.setTypeParser(1082, (v) => v);

const connectionString = process.env.DATABASE_URL;
const password = process.env.DB_PASSWORD ?? process.env.PGPASSWORD;

const poolConfig = connectionString
  ? {
      connectionString,
      ...(password !== undefined ? { password: String(password) } : {}),
    }
  : {
      host: process.env.DB_HOST || process.env.PGHOST || 'localhost',
      port: Number(process.env.DB_PORT || process.env.PGPORT || 5432),
      user: process.env.DB_USER || process.env.PGUSER || 'postgres',
      database: process.env.DB_NAME || process.env.PGDATABASE || 'senales',
      ...(password !== undefined ? { password: String(password) } : {}),
    };

export const pool = new Pool({
  ...poolConfig,
  max: Number(process.env.PG_POOL_MAX || 10),
  options: `-c timezone=${process.env.APP_TIMEZONE || 'America/Lima'}`,
});

pool.on('error', (err) => console.error('[pg] error en cliente inactivo:', err.message));

export const query = (text, params) => pool.query(text, params);

/** Ejecuta fn(client) dentro de una transacción. */
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => { });
    throw err;
  } finally {
    client.release();
  }
}

export default { pool, query, tx };
