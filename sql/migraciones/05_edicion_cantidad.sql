-- =====================================================================
--  MIGRACIÓN 05: edición controlada de cantidades + reglas al día
--  - Deja la BD igual sin importar desde qué versión del esquema vino
--    (columna imagen_url, triggers de stock, borrado de pedidos, vistas).
--  - Permite cambiar la cantidad de una línea SOLO mediante
--    fn_editar_cantidad_linea(): ajusta el stock con movimientos del
--    kardex, recalcula estados y guarda el historial del cambio.
--  - Marca en la línea y en el pedido si la cantidad fue editada.
--  Idempotente: se puede ejecutar más de una vez.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- 0. Nombre único de la columna de imagen (algunas BD usaron imagen_referencial)
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = current_schema() AND table_name = 'senal' AND column_name = 'imagen_referencial')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = current_schema() AND table_name = 'senal' AND column_name = 'imagen_url') THEN
        ALTER TABLE senal RENAME COLUMN imagen_referencial TO imagen_url;
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1. Columnas de edición en la línea
-- ---------------------------------------------------------------------
ALTER TABLE detalle_pedido
    ADD COLUMN IF NOT EXISTS cantidad_original             INT,
    ADD COLUMN IF NOT EXISTS cantidad_editada              BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS veces_editada                 INT     NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS fecha_ultima_edicion          TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS id_colaborador_ultima_edicion INT REFERENCES colaborador(id_colaborador),
    ADD COLUMN IF NOT EXISTS observacion_linea             TEXT;

COMMENT ON COLUMN detalle_pedido.cantidad_original IS 'Cantidad con la que Operaciones registró la línea';
COMMENT ON COLUMN detalle_pedido.cantidad_editada  IS 'TRUE si la cantidad se cambió alguna vez después de registrarla';

-- Historial de cada cambio de cantidad
CREATE TABLE IF NOT EXISTS detalle_pedido_edicion (
    id_edicion           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_detalle_pedido    INT NOT NULL REFERENCES detalle_pedido(id_detalle_pedido) ON DELETE CASCADE,
    id_pedido            INT NOT NULL,
    cantidad_anterior    INT NOT NULL,
    cantidad_nueva       INT NOT NULL,
    desde_stock_anterior INT NOT NULL,
    desde_stock_nuevo    INT NOT NULL,
    motivo               TEXT,
    id_colaborador       INT REFERENCES colaborador(id_colaborador),
    fecha                TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_edicion_detalle ON detalle_pedido_edicion(id_detalle_pedido, fecha);
CREATE INDEX IF NOT EXISTS ix_edicion_pedido  ON detalle_pedido_edicion(id_pedido);

-- ---------------------------------------------------------------------
-- 2. Triggers base (se re-crean para que todas las BD queden iguales)
-- ---------------------------------------------------------------------

-- 2.1 Stock automático al registrar la línea (+ guarda la cantidad original)
CREATE OR REPLACE FUNCTION fn_detalle_asigna_stock() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_stock INT;
BEGIN
    NEW.cantidad_original := COALESCE(NEW.cantidad_original, NEW.cantidad);

    SELECT stock INTO v_stock FROM senal WHERE id_senal = NEW.id_senal FOR UPDATE;
    NEW.cantidad_desde_stock := LEAST(COALESCE(v_stock, 0), NEW.cantidad);

    IF NEW.cantidad_desde_stock > 0 THEN
        INSERT INTO movimiento_stock (id_senal, tipo, cantidad, id_detalle_pedido, observacion)
        VALUES (NEW.id_senal, 'SALIDA_PEDIDO', -NEW.cantidad_desde_stock,
                NEW.id_detalle_pedido, 'Asignado automáticamente al pedido ' || NEW.id_pedido);
    END IF;

    IF NEW.cantidad_desde_stock = NEW.cantidad THEN
        NEW.estado_marketing  := 'NO REQUIERE';
        NEW.estado_produccion := 'NO REQUIERE';
    ELSE
        NEW.estado_marketing  := 'PENDIENTE';
        NEW.estado_produccion := 'PENDIENTE';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_detalle_asigna_stock ON detalle_pedido;
CREATE TRIGGER trg_detalle_asigna_stock
BEFORE INSERT ON detalle_pedido
FOR EACH ROW EXECUTE FUNCTION fn_detalle_asigna_stock();

-- 2.2 Cantidad y stock de la línea solo cambian vía fn_editar_cantidad_linea()
CREATE OR REPLACE FUNCTION fn_detalle_bloquea_cambios() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.id_pedido <> OLD.id_pedido OR NEW.id_senal <> OLD.id_senal THEN
        RAISE EXCEPTION 'No se puede cambiar la señal ni el pedido de la línea %. Elimínela y regístrela de nuevo.',
            OLD.id_detalle_pedido;
    END IF;
    IF (NEW.cantidad <> OLD.cantidad OR NEW.cantidad_desde_stock <> OLD.cantidad_desde_stock
        OR NEW.cantidad_original IS DISTINCT FROM OLD.cantidad_original AND OLD.cantidad_original IS NOT NULL)
       AND COALESCE(current_setting('app.edicion_linea', true), '') <> 'on' THEN
        RAISE EXCEPTION 'La cantidad de la línea % se cambia con "Editar línea" (ajusta el stock y deja historial).',
            OLD.id_detalle_pedido;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_detalle_bloquea_cambios ON detalle_pedido;
CREATE TRIGGER trg_detalle_bloquea_cambios
BEFORE UPDATE ON detalle_pedido
FOR EACH ROW EXECUTE FUNCTION fn_detalle_bloquea_cambios();

-- Rellenar la cantidad original de líneas ya existentes
UPDATE detalle_pedido SET cantidad_original = cantidad WHERE cantidad_original IS NULL;
ALTER TABLE detalle_pedido ALTER COLUMN cantidad_original SET NOT NULL;

-- 2.3 Kardex inmutable (excepto la referencia que queda en NULL al borrar la línea)
CREATE OR REPLACE FUNCTION fn_bloquear_cambio() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.id_detalle_pedido IS NULL
       AND (to_jsonb(NEW) - 'id_detalle_pedido') = (to_jsonb(OLD) - 'id_detalle_pedido') THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION '% no se puede modificar ni borrar; registre un movimiento de AJUSTE', TG_TABLE_NAME;
END $$;

DROP TRIGGER IF EXISTS trg_movimiento_inmutable ON movimiento_stock;
CREATE TRIGGER trg_movimiento_inmutable
BEFORE UPDATE OR DELETE ON movimiento_stock
FOR EACH ROW EXECUTE FUNCTION fn_bloquear_cambio();

-- 2.4 Un pedido entregado no se borra
CREATE OR REPLACE FUNCTION fn_pedido_bloquea_borrado() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.fecha_entrega IS NOT NULL THEN
        RAISE EXCEPTION 'El pedido % ya fue entregado y no se puede eliminar.', OLD.id_pedido;
    END IF;
    RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_pedido_bloquea_borrado ON pedido;
CREATE TRIGGER trg_pedido_bloquea_borrado
BEFORE DELETE ON pedido
FOR EACH ROW EXECUTE FUNCTION fn_pedido_bloquea_borrado();

-- ---------------------------------------------------------------------
-- 3. Edición de cantidad
-- ---------------------------------------------------------------------
--  Reglas:
--   * Subir la cantidad: primero se toma lo que haya en stock; el resto
--     se suma a "a producir".
--   * Bajar la cantidad: primero se reduce lo que falta producir; si no
--     alcanza, se devuelve al stock lo que la línea había tomado.
--   * Nunca por debajo de las unidades que un área ya terminó.
--   * Los estados se recalculan con lo ya trabajado.
CREATE OR REPLACE FUNCTION fn_editar_cantidad_linea(
    p_id_detalle     INT,
    p_cantidad       INT,
    p_id_colaborador INT  DEFAULT NULL,
    p_motivo         TEXT DEFAULT NULL
) RETURNS detalle_pedido
LANGUAGE plpgsql AS $$
DECLARE
    d             detalle_pedido;
    v_stock       INT;
    v_hechas_mkt  INT;
    v_hechas_prod INT;
    v_ses_mkt     INT;
    v_ses_prod    INT;
    v_hechas_max  INT;
    v_ap_actual   INT;
    v_ds          INT;
    v_ap          INT;
    v_tomar       INT := 0;
    v_devolver    INT := 0;
    v_mkt         estado_area;
    v_prod        estado_area;
BEGIN
    IF p_cantidad IS NULL OR p_cantidad < 1 THEN
        RAISE EXCEPTION 'La cantidad debe ser mayor a 0.';
    END IF;

    SELECT * INTO d FROM detalle_pedido WHERE id_detalle_pedido = p_id_detalle FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'La línea % no existe.', p_id_detalle;
    END IF;
    IF EXISTS (SELECT 1 FROM pedido WHERE id_pedido = d.id_pedido AND fecha_entrega IS NOT NULL) THEN
        RAISE EXCEPTION 'El pedido % ya fue entregado; no se puede editar.', d.id_pedido;
    END IF;
    IF p_cantidad = d.cantidad THEN
        RETURN d;
    END IF;

    -- Unidades ya terminadas (etapa final, sesiones cerradas) y sesiones por área
    SELECT COALESCE(SUM(r.cantidad_procesada) FILTER (WHERE e.area = 'MARKETING'  AND e.es_final AND r.fin IS NOT NULL), 0),
           COALESCE(SUM(r.cantidad_procesada) FILTER (WHERE e.area = 'PRODUCCION' AND e.es_final AND r.fin IS NOT NULL), 0),
           COUNT(*) FILTER (WHERE e.area = 'MARKETING'),
           COUNT(*) FILTER (WHERE e.area = 'PRODUCCION')
      INTO v_hechas_mkt, v_hechas_prod, v_ses_mkt, v_ses_prod
      FROM registro_tiempo r
      JOIN etapa e ON e.id_etapa = r.id_etapa
     WHERE r.id_detalle_pedido = p_id_detalle;
    v_hechas_max := GREATEST(v_hechas_mkt, v_hechas_prod);

    SELECT stock INTO v_stock FROM senal WHERE id_senal = d.id_senal FOR UPDATE;
    v_ap_actual := d.cantidad - d.cantidad_desde_stock;

    IF p_cantidad > d.cantidad THEN
        v_tomar := LEAST(v_stock, p_cantidad - d.cantidad);
        v_ds    := d.cantidad_desde_stock + v_tomar;
    ELSE
        IF p_cantidad - d.cantidad_desde_stock >= v_hechas_max THEN
            v_ds := d.cantidad_desde_stock;            -- solo baja lo pendiente de producir
        ELSE
            v_ds := p_cantidad - v_hechas_max;          -- también devuelve stock
            IF v_ds < 0 THEN
                RAISE EXCEPTION 'Ya se terminaron % unidades de esta línea; la cantidad no puede ser menor.', v_hechas_max;
            END IF;
        END IF;
        v_devolver := d.cantidad_desde_stock - v_ds;
    END IF;
    v_ap := p_cantidad - v_ds;

    -- Estados con lo ya trabajado
    IF v_ap = 0 THEN
        v_mkt  := CASE WHEN v_ses_mkt  > 0 THEN 'TERMINADO' ELSE 'NO REQUIERE' END;
        v_prod := CASE WHEN v_ses_prod > 0 THEN 'TERMINADO' ELSE 'NO REQUIERE' END;
    ELSE
        v_mkt  := CASE WHEN v_hechas_mkt  >= v_ap THEN 'TERMINADO'
                       WHEN v_ses_mkt  > 0 THEN 'EN PROCESO' ELSE 'PENDIENTE' END;
        v_prod := CASE WHEN v_hechas_prod >= v_ap THEN 'TERMINADO'
                       WHEN v_ses_prod > 0 THEN 'EN PROCESO' ELSE 'PENDIENTE' END;
    END IF;

    PERFORM set_config('app.edicion_linea', 'on', true);

    IF v_tomar > 0 THEN
        INSERT INTO movimiento_stock (id_senal, tipo, cantidad, id_detalle_pedido, id_colaborador, observacion)
        VALUES (d.id_senal, 'SALIDA_PEDIDO', -v_tomar, d.id_detalle_pedido, p_id_colaborador,
                'Cantidad editada en el pedido ' || d.id_pedido || ' (' || d.cantidad || ' → ' || p_cantidad || ')');
    END IF;
    IF v_devolver > 0 THEN
        INSERT INTO movimiento_stock (id_senal, tipo, cantidad, id_detalle_pedido, id_colaborador, observacion)
        VALUES (d.id_senal, 'DEVOLUCION', v_devolver, d.id_detalle_pedido, p_id_colaborador,
                'Cantidad editada en el pedido ' || d.id_pedido || ' (' || d.cantidad || ' → ' || p_cantidad || ')');
    END IF;

    INSERT INTO detalle_pedido_edicion
        (id_detalle_pedido, id_pedido, cantidad_anterior, cantidad_nueva,
         desde_stock_anterior, desde_stock_nuevo, motivo, id_colaborador)
    VALUES (d.id_detalle_pedido, d.id_pedido, d.cantidad, p_cantidad,
            d.cantidad_desde_stock, v_ds, NULLIF(trim(p_motivo), ''), p_id_colaborador);

    UPDATE detalle_pedido
       SET cantidad                      = p_cantidad,
           cantidad_desde_stock          = v_ds,
           estado_marketing              = v_mkt,
           estado_produccion             = v_prod,
           cantidad_editada              = TRUE,
           veces_editada                 = veces_editada + 1,
           fecha_ultima_edicion          = now(),
           id_colaborador_ultima_edicion = p_id_colaborador
     WHERE id_detalle_pedido = p_id_detalle
     RETURNING * INTO d;

    PERFORM set_config('app.edicion_linea', 'off', true);
    RETURN d;
END $$;

-- ---------------------------------------------------------------------
-- 4. Vistas (columnas nuevas siempre al final para CREATE OR REPLACE)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_pedido_resumen AS
SELECT p.id_pedido,
       c.nombre                                   AS cliente,
       p.prioridad,
       p.fecha_pedido,
       p.fecha_requerida,
       COUNT(d.*)                                 AS lineas,
       COALESCE(SUM(d.cantidad), 0)               AS unidades,
       COALESCE(SUM(d.cantidad_desde_stock), 0)   AS unidades_desde_stock,
       COALESCE(SUM(d.cantidad_a_producir), 0)    AS unidades_a_producir,
       COUNT(*) FILTER (WHERE d.estado_global = 'FINALIZADO') AS lineas_finalizadas,
       ROUND(100.0 * COUNT(*) FILTER (WHERE d.estado_global = 'FINALIZADO')
             / NULLIF(COUNT(d.*), 0), 1)          AS avance_pct,
       CASE
           WHEN p.fecha_entrega IS NOT NULL                                  THEN 'ENTREGADO'
           WHEN COUNT(d.*) > 0 AND BOOL_AND(d.estado_global = 'FINALIZADO')  THEN 'LISTO PARA ENTREGA'
           WHEN BOOL_AND(d.estado_global = 'PENDIENTE')                      THEN 'PENDIENTE'
           ELSE 'EN PROCESO'
       END                                        AS estado_pedido,
       ce.nombre                                  AS entregado_por,
       p.fecha_entrega,
       COUNT(*) FILTER (WHERE d.cantidad_editada) AS lineas_editadas,
       COALESCE(BOOL_OR(d.cantidad_editada), FALSE) AS cantidad_editada,
       COALESCE(SUM(d.cantidad_original), 0)      AS unidades_originales
FROM pedido p
JOIN cliente c           ON c.id_cliente = p.id_cliente
LEFT JOIN detalle_pedido d ON d.id_pedido = p.id_pedido
LEFT JOIN colaborador ce ON ce.id_colaborador = p.id_colaborador_entrega
GROUP BY p.id_pedido, c.nombre, ce.nombre;

CREATE OR REPLACE VIEW v_bandeja_marketing AS
SELECT d.id_detalle_pedido, p.id_pedido, p.prioridad, p.fecha_pedido, c.nombre AS cliente,
       s.nombre AS senal, m.nombre AS material, v.nombre AS vinil,
       s.ancho_cm, s.alto_cm, s.imagen_url,
       d.cantidad_a_producir, d.estado_marketing
FROM detalle_pedido d
JOIN pedido p   ON p.id_pedido  = d.id_pedido
JOIN cliente c  ON c.id_cliente = p.id_cliente
JOIN senal s    ON s.id_senal   = d.id_senal
JOIN material m ON m.id_material = s.id_material
JOIN vinil v    ON v.id_vinil    = s.id_vinil
WHERE d.estado_marketing IN ('PENDIENTE','EN PROCESO');

CREATE OR REPLACE VIEW v_bandeja_produccion AS
SELECT d.id_detalle_pedido, p.id_pedido, p.prioridad, p.fecha_pedido, c.nombre AS cliente,
       s.nombre AS senal, m.nombre AS material, v.nombre AS vinil,
       s.ancho_cm, s.alto_cm, s.imagen_url,
       d.cantidad_a_producir, d.estado_marketing, d.estado_produccion
FROM detalle_pedido d
JOIN pedido p   ON p.id_pedido  = d.id_pedido
JOIN cliente c  ON c.id_cliente = p.id_cliente
JOIN senal s    ON s.id_senal   = d.id_senal
JOIN material m ON m.id_material = s.id_material
JOIN vinil v    ON v.id_vinil    = s.id_vinil
WHERE d.estado_produccion IN ('PENDIENTE','EN PROCESO');

-- Ciclo total solo para líneas finalizadas
CREATE OR REPLACE VIEW v_kpi_ciclo_linea AS
WITH t AS (
    SELECT r.id_detalle_pedido, e.area,
           MIN(r.inicio) AS inicio, MAX(r.fin) AS fin
    FROM registro_tiempo r JOIN etapa e ON e.id_etapa = r.id_etapa
    GROUP BY r.id_detalle_pedido, e.area
)
SELECT d.id_detalle_pedido, d.id_pedido, p.prioridad, d.cantidad_a_producir,
       ROUND(EXTRACT(EPOCH FROM (mk.inicio - p.fecha_pedido)) / 3600.0, 2) AS horas_espera_marketing,
       ROUND(EXTRACT(EPOCH FROM (mk.fin    - mk.inicio))      / 3600.0, 2) AS horas_marketing,
       ROUND(EXTRACT(EPOCH FROM (pr.inicio - mk.fin))         / 3600.0, 2) AS horas_espera_produccion,
       ROUND(EXTRACT(EPOCH FROM (pr.fin    - pr.inicio))      / 3600.0, 2) AS horas_produccion,
       CASE WHEN d.estado_global = 'FINALIZADO' THEN
            ROUND(EXTRACT(EPOCH FROM (GREATEST(mk.fin, pr.fin) - p.fecha_pedido)) / 3600.0, 2)
       END                                                                   AS horas_ciclo_total
FROM detalle_pedido d
JOIN pedido p ON p.id_pedido = d.id_pedido
LEFT JOIN t mk ON mk.id_detalle_pedido = d.id_detalle_pedido AND mk.area = 'MARKETING'
LEFT JOIN t pr ON pr.id_detalle_pedido = d.id_detalle_pedido AND pr.area = 'PRODUCCION'
WHERE d.cantidad_a_producir > 0;

COMMIT;
