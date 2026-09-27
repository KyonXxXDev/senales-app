-- =====================================================================
--  Archivo 3 de 3: consultas de uso diario y KPIs
-- =====================================================================

-- ---------- OPERACIONES ----------
-- Crear un pedido con sus líneas en una sola transacción
-- BEGIN;
-- WITH nuevo AS (
--     INSERT INTO pedido (id_cliente, id_colaborador_solicita, prioridad, fecha_requerida)
--     VALUES (2, 1, 'ALTA', DATE '2026-09-30')
--     RETURNING id_pedido
-- )
-- INSERT INTO detalle_pedido (id_pedido, id_senal, cantidad)
-- SELECT id_pedido, x.id_senal, x.cantidad
-- FROM nuevo, (VALUES (1, 3), (4, 6)) AS x(id_senal, cantidad);
-- COMMIT;

-- Estado de todos los pedidos
SELECT * FROM v_pedido_resumen ORDER BY prioridad DESC, fecha_pedido;

-- Detalle de un pedido (lo que muestra el modal)
SELECT d.id_detalle_pedido, s.nombre AS senal, s.ancho_cm || 'x' || s.alto_cm AS medida,
       m.nombre AS material, v.nombre AS vinil, d.cantidad,
       d.cantidad_desde_stock, d.cantidad_a_producir,
       d.estado_marketing, d.estado_produccion, d.estado_global
FROM detalle_pedido d
JOIN senal s    ON s.id_senal = d.id_senal
JOIN material m ON m.id_material = s.id_material
JOIN vinil v    ON v.id_vinil = s.id_vinil
WHERE d.id_pedido = 1
ORDER BY d.id_detalle_pedido;

-- ---------- MARKETING / PRODUCCIÓN ----------
-- Bandejas de trabajo ordenadas por prioridad y antigüedad
SELECT * FROM v_bandeja_marketing  ORDER BY prioridad DESC, fecha_pedido;
SELECT * FROM v_bandeja_produccion ORDER BY prioridad DESC, fecha_pedido;

-- Iniciar una etapa (fin queda NULL) ...
-- INSERT INTO registro_tiempo (id_detalle_pedido, id_etapa, id_colaborador)
-- VALUES (4, (SELECT id_etapa FROM etapa WHERE area='MARKETING' AND nombre='DISENO'), 2);
-- ... y cerrarla indicando cuántas unidades salieron
-- UPDATE registro_tiempo SET fin = now(), cantidad_procesada = 0 WHERE id_registro_tiempo = 99;

-- Producción ingresa señales sobrantes al stock
-- INSERT INTO movimiento_stock (id_senal, tipo, cantidad, id_colaborador, observacion)
-- VALUES (4, 'ENTRADA', 5, 3, 'Excedente de producción');

-- Kardex de una señal
SELECT fecha, tipo, cantidad, id_detalle_pedido, observacion,
       SUM(cantidad) OVER (ORDER BY fecha, id_movimiento) AS saldo
FROM movimiento_stock WHERE id_senal = 3 ORDER BY fecha, id_movimiento;

-- Tiempos en formato de tu tabla original
SELECT * FROM v_tiempo_marketing  ORDER BY id_detalle_pedido;
SELECT * FROM v_tiempo_produccion ORDER BY id_detalle_pedido;

-- ---------- KPIs ----------
-- Minutos por unidad y m² procesados por etapa
SELECT * FROM v_kpi_etapa ORDER BY area, orden;

-- Productividad por colaborador y mes
SELECT * FROM v_kpi_colaborador_mes ORDER BY mes, area, colaborador;

-- Tiempos de espera y de trabajo por línea
SELECT * FROM v_kpi_ciclo_linea ORDER BY id_detalle_pedido;

-- Tiempo de ciclo promedio por prioridad (¿se atiende primero lo urgente?)
SELECT prioridad,
       ROUND(AVG(horas_espera_marketing), 2) AS espera_mkt_h,
       ROUND(AVG(horas_ciclo_total), 2)      AS ciclo_total_h
FROM v_kpi_ciclo_linea
WHERE horas_ciclo_total IS NOT NULL
GROUP BY prioridad ORDER BY prioridad DESC;

-- % de unidades cubiertas con stock
SELECT * FROM v_kpi_cobertura_stock ORDER BY mes;

-- Cumplimiento de fecha requerida (pedidos entregados a tiempo)
SELECT COUNT(*) FILTER (WHERE fecha_entrega::date <= fecha_requerida) AS a_tiempo,
       COUNT(*) FILTER (WHERE fecha_entrega::date >  fecha_requerida) AS tarde,
       ROUND(100.0 * COUNT(*) FILTER (WHERE fecha_entrega::date <= fecha_requerida)
             / NULLIF(COUNT(*), 0), 1)                                  AS cumplimiento_pct
FROM pedido
WHERE fecha_entrega IS NOT NULL AND fecha_requerida IS NOT NULL;

-- Señales más pedidas (para decidir qué tener en stock)
SELECT s.nombre, SUM(d.cantidad) AS unidades_pedidas, s.stock AS stock_actual
FROM detalle_pedido d JOIN senal s ON s.id_senal = d.id_senal
GROUP BY s.id_senal ORDER BY unidades_pedidas DESC LIMIT 10;
