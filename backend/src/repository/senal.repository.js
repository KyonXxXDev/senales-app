import { pool } from '../config/database.js';

const SELECT_SENAL = `
  SELECT s.*, s.imagen_url AS imagen_referencial, m.nombre AS material, v.nombre AS vinil
    FROM senal s
    JOIN material m ON m.id_material = s.id_material
    JOIN vinil v    ON v.id_vinil    = s.id_vinil`;

export default class SenalRepository {
  constructor(db = pool) {
    this.db = db;
  }

  async findAll({ soloActivos = false, q = '' } = {}) {
    const params = [];
    const where = [];
    if (soloActivos) where.push('s.activo');
    if (q) {
      params.push(`%${q}%`);
      where.push(`s.nombre ILIKE $${params.length}`);
    }
    const sql = `${SELECT_SENAL} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY s.nombre, s.id_senal`;
    const { rows } = await this.db.query(sql, params);
    return rows;
  }

  async findById(id, client = this.db) {
    const { rows } = await client.query(`${SELECT_SENAL} WHERE s.id_senal = $1`, [id]);
    return rows[0] || null;
  }

  async create(data, client = this.db) {
    const img = data.imagen_referencial !== undefined ? data.imagen_referencial : (data.imagen_url || null);
    const { rows } = await client.query(
      `INSERT INTO senal (nombre, id_material, id_vinil, ancho_cm, alto_cm, imagen_url)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id_senal`,
      [data.nombre, data.id_material, data.id_vinil, data.ancho_cm, data.alto_cm, img]
    );
    return rows[0];
  }

  async update(id, data, client = this.db) {
    const img = data.imagen_referencial !== undefined ? data.imagen_referencial : (data.imagen_url || null);
    const { rowCount } = await client.query(
      `UPDATE senal SET nombre=$1, id_material=$2, id_vinil=$3, ancho_cm=$4, alto_cm=$5, imagen_url=$6, activo=$7
        WHERE id_senal = $8`,
      [data.nombre, data.id_material, data.id_vinil, data.ancho_cm, data.alto_cm, img, data.activo, id]
    );
    if (!rowCount) return null;
    return this.findById(id, client);
  }

  async patchActivo(id, activo, client = this.db) {
    const { rows } = await client.query(
      'UPDATE senal SET activo = $1 WHERE id_senal = $2 RETURNING *',
      [activo, id]
    );
    return rows[0] || null;
  }

  async getKardex(id) {
    const { rows } = await this.db.query(
      `SELECT m.*, c.nombre AS colaborador, d.id_pedido,
              SUM(m.cantidad) OVER (ORDER BY m.fecha, m.id_movimiento) AS saldo
         FROM movimiento_stock m
         LEFT JOIN colaborador c   ON c.id_colaborador = m.id_colaborador
         LEFT JOIN detalle_pedido d ON d.id_detalle_pedido = m.id_detalle_pedido
        WHERE m.id_senal = $1
        ORDER BY m.fecha DESC, m.id_movimiento DESC`,
      [id]
    );
    return rows;
  }

  async insertMovimientoStock(mov, client = this.db) {
    const { rows } = await client.query(
      `INSERT INTO movimiento_stock (id_senal, tipo, cantidad, id_colaborador, observacion)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [mov.id_senal, mov.tipo, mov.cantidad, mov.id_colaborador || null, mov.observacion || null]
    );
    return rows[0];
  }
}

