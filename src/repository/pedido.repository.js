import { pool } from '../config/database.js';

const SELECT_DETALLE = `
  SELECT d.*, s.nombre AS senal, s.ancho_cm, s.alto_cm,
         s.imagen_url AS imagen_original_url,
         CASE WHEN s.imagen_url IS NOT NULL AND s.imagen_url <> '' THEN ('api/senales/' || s.id_senal || '/imagen') ELSE NULL END AS imagen_url,
         CASE WHEN s.imagen_url IS NOT NULL AND s.imagen_url <> '' THEN ('api/senales/' || s.id_senal || '/imagen') ELSE NULL END AS imagen_referencial,
         s.stock AS stock_actual,
         m.nombre AS material, v.nombre AS vinil, ce.nombre AS editado_por
    FROM detalle_pedido d
    JOIN senal s    ON s.id_senal    = d.id_senal
    LEFT JOIN colaborador ce ON ce.id_colaborador = d.id_colaborador_ultima_edicion
    JOIN material m ON m.id_material = s.id_material
    JOIN vinil v    ON v.id_vinil    = s.id_vinil`;

export default class PedidoRepository {
  constructor(db = pool) {
    this.db = db;
  }

  async findAll({ estado, prioridad, id_cliente, limite = 200 } = {}) {
    const params = [];
    const where = [];
    if (estado) {
      params.push(estado);
      where.push(`estado_pedido = $${params.length}`);
    }
    if (prioridad) {
      params.push(prioridad);
      where.push(`prioridad = $${params.length}::prioridad_pedido`);
    }
    if (id_cliente) {
      params.push(id_cliente);
      where.push(`id_pedido IN (SELECT id_pedido FROM pedido WHERE id_cliente = $${params.length})`);
    }
    params.push(limite);
    const sql = `
      SELECT * FROM v_pedido_resumen
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY (estado_pedido = 'ENTREGADO'), prioridad DESC, fecha_pedido DESC
      LIMIT $${params.length}`;
    const { rows } = await this.db.query(sql, params);
    return rows;
  }

  async findResumenById(id, client = this.db) {
    const { rows } = await client.query(
      `SELECT r.*, p.id_cliente, p.observacion, p.id_colaborador_solicita, cs.nombre AS solicitado_por
         FROM v_pedido_resumen r
         JOIN pedido p ON p.id_pedido = r.id_pedido
         LEFT JOIN colaborador cs ON cs.id_colaborador = p.id_colaborador_solicita
        WHERE r.id_pedido = $1`,
      [id]
    );
    return rows[0] || null;
  }

  async findDetallesByPedidoId(id, client = this.db) {
    const { rows } = await client.query(
      `${SELECT_DETALLE} WHERE d.id_pedido = $1 ORDER BY d.id_detalle_pedido`,
      [id]
    );
    return rows;
  }

  async findDetalleById(idDetalle, client = this.db) {
    const { rows } = await client.query(
      `${SELECT_DETALLE} WHERE d.id_detalle_pedido = $1`,
      [idDetalle]
    );
    return rows[0] || null;
  }

  async buscarSenalSimilar(d, client = this.db) {
    const { rows } = await client.query(
      `SELECT id_senal FROM senal
        WHERE lower(nombre) = lower($1) AND id_material = $2 AND id_vinil = $3
          AND ((ancho_cm = $4 AND alto_cm = $5) OR (ancho_cm = $5 AND alto_cm = $4))
        LIMIT 1`,
      [d.nombre, d.id_material, d.id_vinil, d.ancho, d.alto]
    );
    return rows[0]?.id_senal || null;
  }

  async createPedido(cab, client = this.db) {
    const { rows } = await client.query(
      `INSERT INTO pedido (id_cliente, prioridad, fecha_requerida, observacion, id_colaborador_solicita)
       VALUES ($1, $2, $3, $4, $5) RETURNING id_pedido`,
      [cab.id_cliente, cab.prioridad, cab.fecha_requerida, cab.observacion, cab.id_colaborador_solicita]
    );
    return rows[0].id_pedido;
  }

  async createDetalle(idPedido, idSenal, cantidad, client = this.db) {
    const { rows } = await client.query(
      'INSERT INTO detalle_pedido (id_pedido, id_senal, cantidad) VALUES ($1, $2, $3) RETURNING id_detalle_pedido',
      [idPedido, idSenal, cantidad]
    );
    return rows[0].id_detalle_pedido;
  }

  async getPedidoLock(id, client = this.db) {
    const { rows } = await client.query(
      'SELECT fecha_entrega FROM pedido WHERE id_pedido = $1 FOR UPDATE',
      [id]
    );
    return rows[0] || null;
  }

  async updatePedido(id, sets, params, client = this.db) {
    const { rowCount } = await client.query(
      `UPDATE pedido SET ${sets.join(', ')} WHERE id_pedido = $${params.length} AND fecha_entrega IS NULL`,
      params
    );
    return rowCount > 0;
  }

  async marcarEntregado(id, idColaborador, client = this.db) {
    const { rowCount } = await client.query(
      `UPDATE pedido SET id_colaborador_entrega = $1, fecha_entrega = now()
        WHERE id_pedido = $2 AND fecha_entrega IS NULL`,
      [idColaborador, id]
    );
    return rowCount > 0;
  }

  async deletePedido(id, client = this.db) {
    const { rowCount } = await client.query('DELETE FROM pedido WHERE id_pedido = $1', [id]);
    return rowCount > 0;
  }

  async getDetallePedidoWithPedidoLock(idDetalle, client = this.db) {
    const { rows } = await client.query(
      `SELECT p.id_pedido, p.fecha_entrega
         FROM detalle_pedido d
         JOIN pedido p ON p.id_pedido = d.id_pedido
        WHERE d.id_detalle_pedido = $1 FOR UPDATE OF p`,
      [idDetalle]
    );
    return rows[0] || null;
  }

  /** Cambia la cantidad con ajuste de stock e historial (función de BD) */
  async editarCantidad(idDetalle, cantidad, idColaborador, motivo, client = this.db) {
    const { rows } = await client.query(
      'SELECT * FROM fn_editar_cantidad_linea($1, $2, $3, $4)',
      [idDetalle, cantidad, idColaborador, motivo]
    );
    return rows[0] || null;
  }

  async actualizarObservacionLinea(idDetalle, observacion, client = this.db) {
    const { rows } = await client.query(
      'UPDATE detalle_pedido SET observacion_linea = $2 WHERE id_detalle_pedido = $1 RETURNING *',
      [idDetalle, observacion]
    );
    return rows[0] || null;
  }

  async getEdiciones({ idDetalle = null, idPedido = null }, client = this.db) {
    const { rows } = await client.query(
      `SELECT e.*, c.nombre AS colaborador, s.nombre AS senal
         FROM detalle_pedido_edicion e
         LEFT JOIN colaborador c ON c.id_colaborador = e.id_colaborador
         LEFT JOIN detalle_pedido d ON d.id_detalle_pedido = e.id_detalle_pedido
         LEFT JOIN senal s ON s.id_senal = d.id_senal
        WHERE ($1::int IS NULL OR e.id_detalle_pedido = $1) AND ($2::int IS NULL OR e.id_pedido = $2)
        ORDER BY e.fecha DESC, e.id_edicion DESC`,
      [idDetalle, idPedido]
    );
    return rows;
  }

  async deleteDetalle(idDetalle, client = this.db) {
    const { rowCount } = await client.query(
      'DELETE FROM detalle_pedido WHERE id_detalle_pedido = $1',
      [idDetalle]
    );
    return rowCount > 0;
  }
}

