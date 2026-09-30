import { Pool, types } from 'pg';
import {
  DB_HOST,
  DB_NAME,
  DB_PASSWORD,
  DB_POOL_MAX,
  DB_PORT,
  DB_USER,
  NODE_ENV,
  PGTZ,
} from './env.config.js';

// NUMERIC (1700) y BIGINT/COUNT (20) llegan como texto: convertir a número
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));
// Retornar columnas tipo DATE (OID 1082) como string plano 'YYYY-MM-DD' sin conversiones UTC/desfases
types.setTypeParser(1082, (val) => val);

const poolConfig = {
  host: DB_HOST,
  port: DB_PORT,
  database: DB_NAME,
  user: DB_USER,
  password: DB_PASSWORD,
  max: DB_POOL_MAX,
  options: `-c timezone=${PGTZ}`,
};

export const pool = new Pool({
  ...poolConfig,
  max: Number(DB_POOL_MAX || 10),
  options: `-c timezone=${PGTZ || 'America/Lima'}`,
});

pool.on('error', (err) => console.error('[pg] error en cliente inactivo:', err.message));

/** Ejecuta una consulta directa al pool */
export const query = (text, params) => pool.query(text, params);

/** Ejecuta fn(client) dentro de una transacción gestionada */
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Verificar conexión al arrancar (solo en desarrollo / producción)
if (NODE_ENV !== 'test') {
  pool.connect((err, client, release) => {
    if (err) {
      console.error('❌ Error al conectar con PostgreSQL:', err.message);
    } else {
      console.info(`✅ PostgreSQL conectado correctamente a "${DB_NAME}", Timezone: ${PGTZ}`);
      release();
    }
  });
}

export default { pool, query, tx };
