'use strict';
import { Router } from 'express';
import { query, tx } from '../db.js';
import { HttpError, ah, int, str, oneOf, date } from '../http.js';
import { controllers } from '../config/module.factory.js';

const router = Router();
const { trabajo } = controllers;

const AREAS = ['MARKETING', 'PRODUCCION'];
// Bandeja de trabajo por área (MARKETING o PRODUCCION)
router.get('/bandeja/:area', ah(trabajo.getBandeja));

/**
 * Bandeja de un área: líneas pendientes o en proceso, con avance
 * (unidades de la etapa final) y sus sesiones de trabajo.
 */
router.get('/bandeja/:area', ah(async (req, res) => {
  const area = oneOf(req.params.area, 'area', AREAS);
  const col = area === 'MARKETING' ? 'estado_marketing' : 'estado_produccion';
  const params = [area];
  let filtro = '';
  if (req.query.prioridad) {
    params.push(oneOf(req.query.prioridad, 'prioridad', ['BAJA', 'MEDIA', 'ALTA']));
    filtro = `AND p.prioridad = $${params.length}::prioridad_pedido`;
  }
  const incluirTerminados = req.query.terminados === '1';
  const { rows } = await query(
    `SELECT d.id_detalle_pedido, d.id_pedido, d.cantidad, d.cantidad_desde_stock, d.cantidad_a_producir,
            d.estado_marketing, d.estado_produccion, d.estado_global, d.${col} AS estado_area,
            p.prioridad, p.fecha_pedido, p.fecha_requerida, p.observacion, c.nombre AS cliente,
            s.id_senal, s.nombre AS senal, s.ancho_cm, s.alto_cm, s.imagen_url, s.imagen_url AS imagen_referencial,
            m.nombre AS material, v.nombre AS vinil,
            COALESCE((SELECT SUM(r.cantidad_procesada) FROM registro_tiempo r JOIN etapa e ON e.id_etapa = r.id_etapa
                       WHERE r.id_detalle_pedido = d.id_detalle_pedido AND e.area = $1
                         AND e.es_final AND r.fin IS NOT NULL), 0) AS unidades_terminadas,
            COALESCE((SELECT json_agg(json_build_object(
                         'id_registro_tiempo', r.id_registro_tiempo, 'id_etapa', r.id_etapa, 'etapa', e.nombre,
                         'inicio', r.inicio, 'fin', r.fin, 'cantidad_procesada', r.cantidad_procesada,
                         'duracion_min', r.duracion_min, 'colaborador', co.nombre, 'observacion', r.observacion)
                         ORDER BY r.inicio)
                        FROM registro_tiempo r
                        JOIN etapa e ON e.id_etapa = r.id_etapa
                        LEFT JOIN colaborador co ON co.id_colaborador = r.id_colaborador
                       WHERE r.id_detalle_pedido = d.id_detalle_pedido AND e.area = $1), '[]') AS registros
       FROM detalle_pedido d
       JOIN pedido p   ON p.id_pedido = d.id_pedido
       JOIN cliente c  ON c.id_cliente = p.id_cliente
       JOIN senal s    ON s.id_senal = d.id_senal
       JOIN material m ON m.id_material = s.id_material
       JOIN vinil v    ON v.id_vinil = s.id_vinil
      WHERE p.fecha_entrega IS NULL
        AND d.${col} ${incluirTerminados ? "<> 'NO REQUIERE'" : "IN ('PENDIENTE','EN PROCESO')"}
        ${filtro}
      ORDER BY p.prioridad DESC, p.fecha_pedido, d.id_pedido, d.id_detalle_pedido`, params);
  res.json(rows);
}));
// Gestión de sesiones de tiempo
router.post('/tiempos', ah(trabajo.iniciarSesion));
router.patch('/tiempos/:id/finalizar', ah(trabajo.finalizarSesion));
router.put('/tiempos/:id', ah(trabajo.modificarSesion));
router.delete('/tiempos/:id', ah(trabajo.eliminarSesion));

// Iniciar una etapa (o registrar una sesión completa si se envía "fin")
router.post('/tiempos', ah(async (req, res) => {
  const b = req.body;
  const idDetalle = int(b.id_detalle_pedido, 'id_detalle_pedido');
  const idEtapa = int(b.id_etapa, 'id_etapa');
  const inicio = date(b.inicio, 'inicio');
  const fin = date(b.fin, 'fin');
  const cantidad = int(b.cantidad_procesada, 'cantidad_procesada', { required: false, min: 0 }) || 0;
// Historial de una línea
router.get('/detalles/:id/tiempos', ah(trabajo.getHistorialLinea));

  const registro = await tx(async (c) => {
    const d = await c.query(
      'SELECT cantidad_a_producir FROM detalle_pedido WHERE id_detalle_pedido = $1 FOR UPDATE', [idDetalle]);
    if (!d.rows.length) throw new HttpError(404, 'Línea no encontrada.');

    if (!fin) {
      const abierta = await c.query(
        'SELECT 1 FROM registro_tiempo WHERE id_detalle_pedido = $1 AND id_etapa = $2 AND fin IS NULL',
        [idDetalle, idEtapa]);
      if (abierta.rows.length) throw new HttpError(409, 'Esa etapa ya tiene una sesión en curso para esta línea.');
    }
    await validarCantidad(c, idDetalle, idEtapa, cantidad, null, d.rows[0].cantidad_a_producir);

    const { rows } = await c.query(
      `INSERT INTO registro_tiempo (id_detalle_pedido, id_etapa, id_colaborador, inicio, fin, cantidad_procesada, observacion)
       VALUES ($1, $2, $3, COALESCE($4::timestamptz, now()), $5, $6, $7) RETURNING *`,
      [idDetalle, idEtapa, int(b.id_colaborador, 'id_colaborador', { required: false }),
       inicio, fin, cantidad, str(b.observacion, 'observacion', { required: false })]);
    return rows[0];
  });
  res.status(201).json(registro);
}));

// Cerrar una sesión en curso indicando unidades producidas
router.patch('/tiempos/:id/finalizar', ah(async (req, res) => {
  const id = int(req.params.id, 'id');
  const cantidad = int(req.body.cantidad_procesada, 'cantidad_procesada', { min: 0 });
  const registro = await tx(async (c) => {
    const r = await c.query(
      `SELECT r.*, d.cantidad_a_producir FROM registro_tiempo r
         JOIN detalle_pedido d ON d.id_detalle_pedido = r.id_detalle_pedido
        WHERE r.id_registro_tiempo = $1 FOR UPDATE OF r, d`, [id]);
    if (!r.rows.length) throw new HttpError(404, 'Registro no encontrado.');
    const reg = r.rows[0];
    if (reg.fin) throw new HttpError(409, 'Esta sesión ya estaba cerrada.');
    await validarCantidad(c, reg.id_detalle_pedido, reg.id_etapa, cantidad, id, reg.cantidad_a_producir);
    const { rows } = await c.query(
      `UPDATE registro_tiempo SET fin = GREATEST(now(), inicio), cantidad_procesada = $1,
              observacion = COALESCE($2, observacion)
        WHERE id_registro_tiempo = $3 RETURNING *`,
      [cantidad, str(req.body.observacion, 'observacion', { required: false }), id]);
    return rows[0];
  });
  res.json(registro);
}));

/** En la etapa final no se puede reportar más de lo que falta producir. */
async function validarCantidad(c, idDetalle, idEtapa, cantidad, excluirId, meta) {
  const e = await c.query('SELECT area, es_final FROM etapa WHERE id_etapa = $1', [idEtapa]);
  if (!e.rows.length) throw new HttpError(400, 'Etapa inexistente.');
  if (!e.rows[0].es_final || cantidad === 0) return;
  const { rows } = await c.query(
    `SELECT COALESCE(SUM(r.cantidad_procesada), 0) AS hechas
       FROM registro_tiempo r JOIN etapa e ON e.id_etapa = r.id_etapa
      WHERE r.id_detalle_pedido = $1 AND e.area = $2 AND e.es_final
        AND ($3::int IS NULL OR r.id_registro_tiempo <> $3)`,
    [idDetalle, e.rows[0].area, excluirId]);
  const faltan = meta - rows[0].hechas;
  if (cantidad > faltan)
    throw new HttpError(400, `Solo faltan ${Math.max(faltan, 0)} unidades por terminar en esta línea.`);
}

// Historial de una línea (ambas áreas)
router.get('/detalles/:id/tiempos', ah(async (req, res) => {
  const { rows } = await query(
    `SELECT r.*, e.area, e.nombre AS etapa, co.nombre AS colaborador
       FROM registro_tiempo r
       JOIN etapa e ON e.id_etapa = r.id_etapa
       LEFT JOIN colaborador co ON co.id_colaborador = r.id_colaborador
      WHERE r.id_detalle_pedido = $1 ORDER BY r.inicio`, [int(req.params.id, 'id')]);
  res.json(rows);
}));

export default router;
