import { pool } from '../config/database.js';

export default class ClienteRepository {
  constructor(db = pool) {
    this.db = db;
  }

  async findAll({ soloActivos = false } = {}) {
    const { rows } = await this.db.query(
      `SELECT * FROM cliente ${soloActivos ? 'WHERE activo' : ''} ORDER BY nombre`
    );
    return rows;
  }

  async findById(id) {
    const { rows } = await this.db.query('SELECT * FROM cliente WHERE id_cliente = $1', [id]);
    return rows[0] || null;
  }

  async create(data) {
    const cols = Object.keys(data);
    const { rows } = await this.db.query(
      `INSERT INTO cliente (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`,
      Object.values(data)
    );
    return rows[0];
  }

  async update(id, data) {
    const cols = Object.keys(data);
    if (!cols.length) return null;
    const { rows } = await this.db.query(
      `UPDATE cliente SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')}
       WHERE id_cliente = $${cols.length + 1} RETURNING *`,
      [...Object.values(data), id]
    );
    return rows[0] || null;
  }

  async delete(id) {
    const { rowCount } = await this.db.query('DELETE FROM cliente WHERE id_cliente = $1', [id]);
    return rowCount > 0;
  }
}

