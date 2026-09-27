import { pool } from '../config/database.js';

export default class KpiRepository {
  constructor(db = pool) {
    this.db = db;
  }

  async getKpisCompletos() {
    const q = (sql) => this.db.query(sql).then((r) => r.rows);

    const [
      resumen,
      estados,
      prioridad,
      material,
      vinil,
      etapas,
      colaboradores,
      cicloPrioridad,
      cobertura,
      cumplimiento,
      topSenales,
      stockBajo,
    ] = await Promise.all([
      q(`SELECT COUNT(*)                                                   AS pedidos,
                COUNT(*) FILTER (WHERE estado_pedido = 'PENDIENTE')         AS pendientes,
                COUNT(*) FILTER (WHERE estado_pedido = 'EN PROCESO')        AS en_proceso,
                COUNT(*) FILTER (WHERE estado_pedido = 'LISTO PARA ENTREGA') AS listos,
                COUNT(*) FILTER (WHERE estado_pedido = 'ENTREGADO')         AS entregados,
                COALESCE(SUM(unidades), 0)                                  AS unidades,
                COALESCE(SUM(unidades_desde_stock), 0)                      AS unidades_desde_stock,
                COALESCE(SUM(unidades_a_producir), 0)                       AS unidades_a_producir,
                ROUND(100.0 * SUM(lineas_finalizadas) / NULLIF(SUM(lineas), 0), 1) AS avance_pct
           FROM v_pedido_resumen`),
      q(`SELECT estado_global AS etiqueta, COUNT(*) AS lineas, SUM(cantidad) AS unidades
           FROM detalle_pedido GROUP BY 1 ORDER BY 1`),
      q(`SELECT prioridad AS etiqueta, COUNT(*) AS pedidos FROM pedido GROUP BY 1 ORDER BY 1`),
      q(`SELECT m.nombre AS etiqueta, SUM(d.cantidad) AS unidades
           FROM detalle_pedido d JOIN senal s USING (id_senal) JOIN material m USING (id_material)
          GROUP BY 1 ORDER BY 2 DESC`),
      q(`SELECT v.nombre AS etiqueta, SUM(d.cantidad) AS unidades
           FROM detalle_pedido d JOIN senal s USING (id_senal) JOIN vinil v USING (id_vinil)
          GROUP BY 1 ORDER BY 2 DESC`),
      q(`SELECT * FROM v_kpi_etapa ORDER BY area, orden`),
      q(`SELECT * FROM v_kpi_colaborador_mes ORDER BY mes DESC, area, colaborador`),
      q(`SELECT prioridad,
                COUNT(*) FILTER (WHERE horas_ciclo_total IS NOT NULL) AS lineas_finalizadas,
                ROUND(AVG(horas_espera_marketing), 2) AS espera_marketing_h,
                ROUND(AVG(horas_marketing), 2)        AS marketing_h,
                ROUND(AVG(horas_espera_produccion), 2) AS espera_produccion_h,
                ROUND(AVG(horas_produccion), 2)       AS produccion_h,
                ROUND(AVG(horas_ciclo_total), 2)      AS ciclo_total_h
           FROM v_kpi_ciclo_linea GROUP BY prioridad ORDER BY prioridad DESC`),
      q(`SELECT * FROM v_kpi_cobertura_stock ORDER BY mes`),
      q(`SELECT COUNT(*) FILTER (WHERE fecha_entrega::date <= fecha_requerida) AS a_tiempo,
                COUNT(*) FILTER (WHERE fecha_entrega::date >  fecha_requerida) AS tarde,
                ROUND(100.0 * COUNT(*) FILTER (WHERE fecha_entrega::date <= fecha_requerida)
                      / NULLIF(COUNT(*), 0), 1) AS cumplimiento_pct
           FROM pedido WHERE fecha_entrega IS NOT NULL AND fecha_requerida IS NOT NULL`),
      q(`SELECT s.id_senal, s.nombre, m.nombre AS material, v.nombre AS vinil, s.ancho_cm, s.alto_cm,
                SUM(d.cantidad) AS unidades_pedidas, s.stock
           FROM detalle_pedido d JOIN senal s USING (id_senal)
           JOIN material m ON m.id_material = s.id_material JOIN vinil v ON v.id_vinil = s.id_vinil
          GROUP BY s.id_senal, m.nombre, v.nombre ORDER BY unidades_pedidas DESC LIMIT 10`),
      q(`SELECT COUNT(*) AS sin_stock FROM senal WHERE activo AND stock = 0`),
    ]);

    return {
      resumen: {
        ...resumen[0],
        ...cumplimiento[0],
        senales_sin_stock: stockBajo[0]?.sin_stock || 0,
      },
      estados,
      prioridad,
      material,
      vinil,
      etapas,
      colaboradores,
      cicloPrioridad,
      cobertura,
      topSenales,
    };
  }
}

