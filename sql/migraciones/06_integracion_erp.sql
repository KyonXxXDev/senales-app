-- =====================================================================
--  MIGRACIÓN 06: integración con el ERP (RRHH + Inventario)
--  - Colaboradores enlazados a empleados/usuarios del ERP (SSO).
--  - Materiales y viniles enlazados a productos del inventario del ERP.
--  - Consumo de insumos generado al terminar unidades (para que
--    Logística lo descargue en el ERP).
--  Idempotente.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- 1. Colaboradores del ERP
-- ---------------------------------------------------------------------
ALTER TABLE colaborador
    ADD COLUMN IF NOT EXISTS email                 VARCHAR(180),
    ADD COLUMN IF NOT EXISTS employee_id           UUID,
    ADD COLUMN IF NOT EXISTS erp_user_id           UUID,
    ADD COLUMN IF NOT EXISTS erp_username          VARCHAR(100),
    ADD COLUMN IF NOT EXISTS erp_codigo            VARCHAR(30),
    ADD COLUMN IF NOT EXISTS erp_area              VARCHAR(150),
    ADD COLUMN IF NOT EXISTS erp_cargo             VARCHAR(150),
    ADD COLUMN IF NOT EXISTS erp_rol               VARCHAR(50),
    ADD COLUMN IF NOT EXISTS es_admin              BOOLEAN     NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS area_fija             BOOLEAN     NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS origen                VARCHAR(10) NOT NULL DEFAULT 'LOCAL',
    ADD COLUMN IF NOT EXISTS ultima_sincronizacion TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'colaborador_origen_check') THEN
        ALTER TABLE colaborador ADD CONSTRAINT colaborador_origen_check CHECK (origen IN ('LOCAL', 'ERP'));
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_colaborador_employee ON colaborador(employee_id) WHERE employee_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_colaborador_erp_user ON colaborador(erp_user_id) WHERE erp_user_id IS NOT NULL;

-- Área NULL = la persona viene del ERP desde un área sin equivalente aquí (solo consulta)
ALTER TABLE colaborador ALTER COLUMN area DROP NOT NULL;

COMMENT ON COLUMN colaborador.employee_id IS 'employee.id del ERP (RRHH)';
COMMENT ON COLUMN colaborador.erp_user_id IS 'users.id del ERP (cuenta con la que inicia sesión)';
COMMENT ON COLUMN colaborador.area        IS 'Área en este sistema; NULL = solo consulta';
COMMENT ON COLUMN colaborador.area_fija   IS 'TRUE = el área la asignó un administrador aquí y la sincronización con el ERP no la cambia';

-- ---------------------------------------------------------------------
-- 2. Insumos enlazados al inventario del ERP
-- ---------------------------------------------------------------------
ALTER TABLE material
    ADD COLUMN IF NOT EXISTS erp_product_id     UUID,
    ADD COLUMN IF NOT EXISTS erp_product_codigo VARCHAR(50),
    ADD COLUMN IF NOT EXISTS erp_product_nombre VARCHAR(200),
    ADD COLUMN IF NOT EXISTS erp_unidad         VARCHAR(50),
    ADD COLUMN IF NOT EXISTS factor_m2          NUMERIC(10,4) NOT NULL DEFAULT 1;

ALTER TABLE vinil
    ADD COLUMN IF NOT EXISTS erp_product_id     UUID,
    ADD COLUMN IF NOT EXISTS erp_product_codigo VARCHAR(50),
    ADD COLUMN IF NOT EXISTS erp_product_nombre VARCHAR(200),
    ADD COLUMN IF NOT EXISTS erp_unidad         VARCHAR(50),
    ADD COLUMN IF NOT EXISTS factor_m2          NUMERIC(10,4) NOT NULL DEFAULT 1;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'material_factor_m2_check') THEN
        ALTER TABLE material ADD CONSTRAINT material_factor_m2_check CHECK (factor_m2 > 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vinil_factor_m2_check') THEN
        ALTER TABLE vinil ADD CONSTRAINT vinil_factor_m2_check CHECK (factor_m2 > 0);
    END IF;
END $$;

COMMENT ON COLUMN material.factor_m2 IS 'm² que rinde 1 unidad del producto del ERP (plancha 1.22×2.44 = 2.9768). 1 = el ERP mide en m²';
COMMENT ON COLUMN vinil.factor_m2    IS 'm² que rinde 1 unidad del producto del ERP (rollo 1.52×50 = 76). 1 = el ERP mide en m²';

-- ---------------------------------------------------------------------
-- 3. Consumo de insumos
--    Se genera al cerrar sesiones de la etapa final:
--      Marketing (impresión)  -> consume VINIL
--      Producción (final)     -> consume MATERIAL (sustrato)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS consumo_insumo (
    id_consumo              INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_registro_tiempo      INT REFERENCES registro_tiempo(id_registro_tiempo) ON DELETE SET NULL,
    id_detalle_pedido       INT REFERENCES detalle_pedido(id_detalle_pedido) ON DELETE SET NULL,
    id_pedido               INT,
    tipo                    VARCHAR(10)   NOT NULL CHECK (tipo IN ('MATERIAL', 'VINIL')),
    id_material             INT REFERENCES material(id_material),
    id_vinil                INT REFERENCES vinil(id_vinil),
    erp_product_id          UUID,
    unidades_senal          INT           NOT NULL CHECK (unidades_senal > 0),
    m2                      NUMERIC(12,4) NOT NULL,
    cantidad_erp            NUMERIC(12,4) NOT NULL,
    unidad_erp              VARCHAR(50),
    estado                  VARCHAR(12)   NOT NULL DEFAULT 'PENDIENTE'
                            CHECK (estado IN ('PENDIENTE', 'REGISTRADO', 'ANULADO')),
    referencia_erp          TEXT,
    id_colaborador_registra INT REFERENCES colaborador(id_colaborador),
    fecha                   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    fecha_registro_erp      TIMESTAMPTZ,
    CHECK ((tipo = 'MATERIAL' AND id_material IS NOT NULL) OR (tipo = 'VINIL' AND id_vinil IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS ix_consumo_estado   ON consumo_insumo(estado, fecha);
CREATE INDEX IF NOT EXISTS ix_consumo_registro ON consumo_insumo(id_registro_tiempo);

-- Recalcula el consumo de UNA sesión (solo mientras siga PENDIENTE)
CREATE OR REPLACE FUNCTION fn_recalcular_consumo(p_id_registro INT) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    r RECORD;
BEGIN
    -- Si Logística ya lo registró en el ERP, no se toca
    IF EXISTS (SELECT 1 FROM consumo_insumo
                WHERE id_registro_tiempo = p_id_registro AND estado = 'REGISTRADO') THEN
        RETURN;
    END IF;

    DELETE FROM consumo_insumo WHERE id_registro_tiempo = p_id_registro AND estado = 'PENDIENTE';

    SELECT rt.id_registro_tiempo, rt.id_detalle_pedido, rt.cantidad_procesada, rt.fin,
           e.area, e.es_final, d.id_pedido, s.area_m2,
           m.id_material, m.erp_product_id AS mat_prod, m.factor_m2 AS mat_factor, m.erp_unidad AS mat_unidad,
           v.id_vinil,    v.erp_product_id AS vin_prod, v.factor_m2 AS vin_factor, v.erp_unidad AS vin_unidad
      INTO r
      FROM registro_tiempo rt
      JOIN etapa e          ON e.id_etapa = rt.id_etapa
      JOIN detalle_pedido d ON d.id_detalle_pedido = rt.id_detalle_pedido
      JOIN senal s          ON s.id_senal = d.id_senal
      JOIN material m       ON m.id_material = s.id_material
      JOIN vinil v          ON v.id_vinil = s.id_vinil
     WHERE rt.id_registro_tiempo = p_id_registro;

    IF NOT FOUND OR r.fin IS NULL OR NOT r.es_final OR r.cantidad_procesada <= 0 THEN
        RETURN;
    END IF;

    IF r.area = 'MARKETING' THEN
        INSERT INTO consumo_insumo (id_registro_tiempo, id_detalle_pedido, id_pedido, tipo, id_vinil,
                                    erp_product_id, unidades_senal, m2, cantidad_erp, unidad_erp, fecha)
        VALUES (r.id_registro_tiempo, r.id_detalle_pedido, r.id_pedido, 'VINIL', r.id_vinil,
                r.vin_prod, r.cantidad_procesada, r.area_m2 * r.cantidad_procesada,
                ROUND(r.area_m2 * r.cantidad_procesada / r.vin_factor, 4), r.vin_unidad, r.fin);
    ELSE
        INSERT INTO consumo_insumo (id_registro_tiempo, id_detalle_pedido, id_pedido, tipo, id_material,
                                    erp_product_id, unidades_senal, m2, cantidad_erp, unidad_erp, fecha)
        VALUES (r.id_registro_tiempo, r.id_detalle_pedido, r.id_pedido, 'MATERIAL', r.id_material,
                r.mat_prod, r.cantidad_procesada, r.area_m2 * r.cantidad_procesada,
                ROUND(r.area_m2 * r.cantidad_procesada / r.mat_factor, 4), r.mat_unidad, r.fin);
    END IF;
END $$;

CREATE OR REPLACE FUNCTION fn_tiempo_consumo() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM consumo_insumo WHERE id_registro_tiempo = OLD.id_registro_tiempo AND estado = 'PENDIENTE';
        RETURN OLD;
    END IF;
    PERFORM fn_recalcular_consumo(NEW.id_registro_tiempo);
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tiempo_consumo ON registro_tiempo;
CREATE TRIGGER trg_tiempo_consumo
AFTER INSERT OR UPDATE ON registro_tiempo
FOR EACH ROW EXECUTE FUNCTION fn_tiempo_consumo();

DROP TRIGGER IF EXISTS trg_tiempo_consumo_borrar ON registro_tiempo;
CREATE TRIGGER trg_tiempo_consumo_borrar
BEFORE DELETE ON registro_tiempo
FOR EACH ROW EXECUTE FUNCTION fn_tiempo_consumo();

-- Generar el consumo de las sesiones que ya existían antes de esta migración
DO $$
DECLARE x RECORD;
BEGIN
    FOR x IN SELECT r.id_registro_tiempo FROM registro_tiempo r
              WHERE r.fin IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM consumo_insumo c WHERE c.id_registro_tiempo = r.id_registro_tiempo)
    LOOP
        PERFORM fn_recalcular_consumo(x.id_registro_tiempo);
    END LOOP;
END $$;

-- Si el insumo se enlaza al ERP después, los consumos pendientes toman el producto y factor nuevos
CREATE OR REPLACE FUNCTION fn_insumo_enlace_erp() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.erp_product_id IS DISTINCT FROM OLD.erp_product_id OR NEW.factor_m2 <> OLD.factor_m2
       OR NEW.erp_unidad IS DISTINCT FROM OLD.erp_unidad THEN
        IF TG_TABLE_NAME = 'material' THEN
            UPDATE consumo_insumo
               SET erp_product_id = NEW.erp_product_id, unidad_erp = NEW.erp_unidad,
                   cantidad_erp = ROUND(m2 / NEW.factor_m2, 4)
             WHERE estado = 'PENDIENTE' AND id_material = NEW.id_material;
        ELSE
            UPDATE consumo_insumo
               SET erp_product_id = NEW.erp_product_id, unidad_erp = NEW.erp_unidad,
                   cantidad_erp = ROUND(m2 / NEW.factor_m2, 4)
             WHERE estado = 'PENDIENTE' AND id_vinil = NEW.id_vinil;
        END IF;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_material_enlace_erp ON material;
CREATE TRIGGER trg_material_enlace_erp AFTER UPDATE ON material
FOR EACH ROW EXECUTE FUNCTION fn_insumo_enlace_erp();

DROP TRIGGER IF EXISTS trg_vinil_enlace_erp ON vinil;
CREATE TRIGGER trg_vinil_enlace_erp AFTER UPDATE ON vinil
FOR EACH ROW EXECUTE FUNCTION fn_insumo_enlace_erp();

-- Resumen de consumo pendiente por insumo (lo que Logística debe descargar en el ERP)
CREATE OR REPLACE VIEW v_consumo_pendiente AS
SELECT c.tipo,
       COALESCE(c.id_material, c.id_vinil)                 AS id_insumo,
       COALESCE(m.nombre, v.nombre)                         AS insumo,
       c.erp_product_id,
       COALESCE(m.erp_product_codigo, v.erp_product_codigo) AS erp_product_codigo,
       COALESCE(m.erp_product_nombre, v.erp_product_nombre) AS erp_product_nombre,
       MAX(c.unidad_erp)                                    AS unidad_erp,
       COUNT(*)                                             AS registros,
       SUM(c.unidades_senal)                                AS unidades_senal,
       ROUND(SUM(c.m2), 4)                                  AS m2,
       ROUND(SUM(c.cantidad_erp), 4)                        AS cantidad_erp,
       MIN(c.fecha)                                         AS desde,
       MAX(c.fecha)                                         AS hasta
FROM consumo_insumo c
LEFT JOIN material m ON m.id_material = c.id_material
LEFT JOIN vinil v    ON v.id_vinil    = c.id_vinil
WHERE c.estado = 'PENDIENTE'
GROUP BY c.tipo, COALESCE(c.id_material, c.id_vinil), COALESCE(m.nombre, v.nombre), c.erp_product_id,
         COALESCE(m.erp_product_codigo, v.erp_product_codigo), COALESCE(m.erp_product_nombre, v.erp_product_nombre);

COMMIT;
