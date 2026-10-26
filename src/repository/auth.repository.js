import { pool } from '../config/database.js';

export default class AuthRepository {
  constructor(db = pool) {
    this.db = db;
  }

  async findColaboradorById(id) {
    const { rows } = await this.db.query(
      'SELECT id_colaborador, nombre, area, activo, es_admin FROM colaborador WHERE id_colaborador = $1',
      [id]
    );
    return rows[0] || null;
  }

  async findActiveColaboradores() {
    const { rows } = await this.db.query(
      `SELECT id_colaborador, nombre, area FROM colaborador
        WHERE activo AND area IS NOT NULL ORDER BY area, nombre`
    );
    return rows;
  }
}
