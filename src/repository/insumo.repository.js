import { pool } from '../config/database.js';

const TABLAS = {
  MATERIAL: { tabla: 'material', id: 'id_material' },
  VINIL: { tabla: 'vinil', id: 'id_vinil' },
};

export default class InsumoRepository {
  constructor(db = pool) {
    this.db = db;
  }

  /** Materiales y viniles con su enlace al ERP y el consumo pendiente */
  async listar() {
    const { rows } = await this.db.query(`
      WITH pend AS (
        SELECT tipo, COALESCE(id_material, id_vinil) AS id_insumo,
               SUM(m2) AS m2_pendiente, SUM(cantidad_erp) AS cantidad_pendiente, COUNT(*) AS registros_pendientes
          FROM consumo_insumo WHERE estado = 'PENDIENTE'
         GROUP BY 1, 2
      )
      SELECT 'MATERIAL' AS tipo, m.id_material AS id, m.nombre, m.activo,
             m.erp_product_id, m.erp_product_codigo, m.erp_product_nombre, m.erp_unidad, m.factor_m2,
             COALESCE(p.m2_pendiente, 0) AS m2_pendiente, COALESCE(p.cantidad_pendiente, 0) AS cantidad_pendiente,
             COALESCE(p.registros_pendientes, 0) AS registros_pendientes
        FROM material m LEFT JOIN pend p ON p.tipo = 'MATERIAL' AND p.id_insumo = m.id_material
      UNION ALL
      SELECT 'VINIL', v.id_vinil, v.nombre, v.activo,
             v.erp_product_id, v.erp_product_codigo, v.erp_product_nombre, v.erp_unidad, v.factor_m2,
             COALESCE(p.m2_pendiente, 0), COALESCE(p.cantidad_pendiente, 0), COALESCE(p.registros_pendientes, 0)
        FROM vinil v LEFT JOIN pend p ON p.tipo = 'VINIL' AND p.id_insumo = v.id_vinil
      ORDER BY 1, 3`);
    return rows;
  }

  async enlazar(tipo, id, d) {
    const t = TABLAS[tipo];
    const { rows } = await this.db.query(
      `UPDATE ${t.tabla}
          SET erp_product_id = $2, erp_product_codigo = $3, erp_product_nombre = $4,
              erp_unidad = $5, factor_m2 = $6
        WHERE ${t.id} = $1
        RETURNING *`,
      [id, d.erp_product_id, d.erp_product_codigo, d.erp_product_nombre, d.erp_unidad, d.factor_m2]
    );
    return rows[0] || null;
  }

  async consumos({ estado = null, tipo = null, limite = 300 } = {}) {
    const params = [];
    const where = [];
    if (estado) { params.push(estado); where.push(`c.estado = $${params.length}`); }
    if (tipo) { params.push(tipo); where.push(`c.tipo = $${params.length}`); }
    params.push(limite);
    const { rows } = await this.db.query(
      `SELECT c.*, COALESCE(m.nombre, v.nombre) AS insumo,
              COALESCE(m.erp_product_codigo, v.erp_product_codigo) AS erp_product_codigo,
              COALESCE(m.erp_product_nombre, v.erp_product_nombre) AS erp_product_nombre,
              s.nombre AS senal, cl.nombre AS cliente, e.nombre AS etapa, co.nombre AS colaborador,
              cr.nombre AS registrado_por
         FROM consumo_insumo c
         LEFT JOIN material m        ON m.id_material = c.id_material
         LEFT JOIN vinil v           ON v.id_vinil = c.id_vinil
         LEFT JOIN detalle_pedido d  ON d.id_detalle_pedido = c.id_detalle_pedido
         LEFT JOIN senal s           ON s.id_senal = d.id_senal
         LEFT JOIN pedido p          ON p.id_pedido = c.id_pedido
         LEFT JOIN cliente cl        ON cl.id_cliente = p.id_cliente
         LEFT JOIN registro_tiempo r ON r.id_registro_tiempo = c.id_registro_tiempo
         LEFT JOIN etapa e           ON e.id_etapa = r.id_etapa
         LEFT JOIN colaborador co    ON co.id_colaborador = r.id_colaborador
         LEFT JOIN colaborador cr    ON cr.id_colaborador = c.id_colaborador_registra
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY c.fecha DESC, c.id_consumo DESC
        LIMIT $${params.length}`,
      params
    );
    return rows;
  }

  async resumenPendiente() {
    const { rows } = await this.db.query('SELECT * FROM v_consumo_pendiente ORDER BY tipo, insumo');
    return rows;
  }

  /** Cambia de PENDIENTE a REGISTRADO o ANULADO. Devuelve cuántos cambiaron. */
  async marcar(ids, estado, referencia, idColaborador) {
    const { rowCount } = await this.db.query(
      `UPDATE consumo_insumo
          SET estado = $2, referencia_erp = $3, id_colaborador_registra = $4, fecha_registro_erp = now()
        WHERE id_consumo = ANY($1::int[]) AND estado = 'PENDIENTE'`,
      [ids, estado, referencia, idColaborador]
    );
    return rowCount;
  }
}
