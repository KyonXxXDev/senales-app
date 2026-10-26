-- =====================================================================
--  Catálogos base para una instalación limpia (sin datos de ejemplo)
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

COMMIT;
