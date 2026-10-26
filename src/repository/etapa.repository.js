import { pool } from '../config/database.js';

export default class EtapaRepository {
  constructor(db = pool) {
    this.db = db;
  }

  async findAll() {
    const { rows } = await this.db.query('SELECT * FROM etapa ORDER BY area, orden');
    return rows;
  }

  async findByArea(area) {
    const { rows } = await this.db.query('SELECT * FROM etapa WHERE area = $1 ORDER BY orden', [area]);
    return rows;
  }

  async findById(id) {
    const { rows } = await this.db.query('SELECT * FROM etapa WHERE id_etapa = $1', [id]);
    return rows[0] || null;
  }
}

