-- =====================================================================
--  Archivo 2 de 3: catálogos base y datos de ejemplo
--  (tomados de tus tablas; el stock de las señales 3 y 4 se bajó
--   para que el ejemplo muestre los dos caminos: stock e impresión)
-- =====================================================================
BEGIN;

-- ---------- Catálogos base (necesarios en producción) ----------
INSERT INTO material (nombre) VALUES
  ('Celtec'), ('Sustrato de aluminio'), ('Acrílico'), ('Adhesivo'), ('Banner Black Out');

INSERT INTO vinil (nombre) VALUES
  ('Vinil blanco'), ('Vinil transparente'), ('Vinil reflectivo'), ('Vinil fotoluminiscente');

-- Etapas: ajusta nombres/orden a como trabaja cada área.
-- La etapa es_final es la que cuenta unidades terminadas.
INSERT INTO etapa (area, nombre, orden, es_final) VALUES
  ('MARKETING',  'DISENO',             1, FALSE),
  ('MARKETING',  'ENCUADRE',           2, FALSE),
  ('MARKETING',  'IMPRESION',          3, TRUE),
  ('PRODUCCION', 'CORTE',              1, FALSE),   -- corte del sustrato
  ('PRODUCCION', 'ARMADO',             2, FALSE),   -- pegado del vinil sobre la placa
  ('PRODUCCION', 'CONTROL Y EMBALAJE', 3, TRUE);

-- ---------- Datos de ejemplo ----------
INSERT INTO cliente (nombre) VALUES ('cliente01'), ('cliente02');

INSERT INTO colaborador (nombre, area) VALUES
  ('Ana Operaciones',  'OPERACIONES'),   -- 1
  ('Luis Marketing',   'MARKETING'),     -- 2
  ('Pedro Producción', 'PRODUCCION');    -- 3

INSERT INTO senal (nombre, id_material, id_vinil, ancho_cm, alto_cm, imagen_referencial) VALUES
  ('texto 01', 1, 1, 20, 30, 'URL-Sharepoint'),
  ('texto 02', 2, 2, 30, 20, 'URL-Sharepoint'),
  ('texto 03', 3, 3, 30, 40, 'URL-Sharepoint'),
  ('texto 04', 4, 4, 41, 50, 'URL-Sharepoint');

-- Stock inicial: siempre como movimiento ENTRADA (así queda en el kardex)
INSERT INTO movimiento_stock (id_senal, tipo, cantidad, id_colaborador, observacion) VALUES
  (1, 'ENTRADA',  1, 3, 'Inventario inicial'),
  (2, 'ENTRADA', 10, 3, 'Inventario inicial'),
  (3, 'ENTRADA',  3, 3, 'Inventario inicial');
  -- señal 4 sin stock

INSERT INTO pedido (id_cliente, id_colaborador_solicita, prioridad, fecha_pedido) VALUES
  (1, 1, 'BAJA',  '2026-09-21 08:00-05'),
  (1, 1, 'MEDIA', '2026-09-21 09:00-05'),
  (2, 1, 'ALTA',  '2026-09-21 10:00-05');

-- Al insertar, el trigger toma stock y fija los estados solo.
INSERT INTO detalle_pedido (id_pedido, id_senal, cantidad) VALUES
  (1, 1,  5),   -- 1 de stock, 4 a producir
  (1, 2,  2),   -- 2 de stock -> NO REQUIERE
  (1, 3,  5),   -- 3 de stock, 2 a producir
  (1, 4, 10),   -- 0 de stock, 10 a producir
  (2, 3,  5),   -- stock ya agotado -> 5 a producir
  (2, 4, 10),
  (3, 2,  2),   -- de stock
  (3, 3,  5);

-- Tiempos de Marketing de la línea 1 (4 unidades, impresas en dos tandas)
INSERT INTO registro_tiempo (id_detalle_pedido, id_etapa, id_colaborador, inicio, fin, cantidad_procesada) VALUES
  (1, 1, 2, '2026-09-21 09:00-05', '2026-09-21 09:40-05', 0),
  (1, 2, 2, '2026-09-21 09:40-05', '2026-09-21 09:55-05', 0),
  (1, 3, 2, '2026-09-21 10:00-05', '2026-09-21 10:20-05', 2),
  (1, 3, 2, '2026-09-21 11:00-05', '2026-09-21 11:15-05', 2);   -- completa las 4 -> TERMINADO

-- Tiempos de Producción de la línea 1
INSERT INTO registro_tiempo (id_detalle_pedido, id_etapa, id_colaborador, inicio, fin, cantidad_procesada) VALUES
  (1, 4, 3, '2026-09-21 13:00-05', '2026-09-21 13:30-05', 4),
  (1, 5, 3, '2026-09-21 13:30-05', '2026-09-21 14:10-05', 4),
  (1, 6, 3, '2026-09-21 14:10-05', '2026-09-21 14:20-05', 4);   -- -> TERMINADO

-- Línea 3: Marketing a medio camino (diseño hecho, impresión en curso)
INSERT INTO registro_tiempo (id_detalle_pedido, id_etapa, id_colaborador, inicio, fin, cantidad_procesada) VALUES
  (3, 1, 2, '2026-09-22 09:00-05', '2026-09-22 09:25-05', 0),
  (3, 3, 2, '2026-09-22 10:00-05', NULL, 0);                    -- en curso

-- Pedido 3 con la línea 8 a producir; línea 7 salió de stock.
-- Pedido 3 línea 8: Marketing y Producción completos
INSERT INTO registro_tiempo (id_detalle_pedido, id_etapa, id_colaborador, inicio, fin, cantidad_procesada) VALUES
  (8, 3, 2, '2026-09-21 10:30-05', '2026-09-21 11:00-05', 5),
  (8, 6, 3, '2026-09-21 15:00-05', '2026-09-21 15:45-05', 5);

-- Entrega del pedido 3 (todas sus líneas finalizadas)
UPDATE pedido SET id_colaborador_entrega = 1, fecha_entrega = '2026-09-22 08:00-05'
WHERE id_pedido = 3;

COMMIT;
