-- =====================================================================
--  SISTEMA DE PEDIDOS DE SEÑALES  (Operaciones -> Marketing -> Producción)
--  PostgreSQL 14+          Archivo 1 de 3: estructura, reglas y vistas
-- ---------------------------------------------------------------------
--  Flujo:
--   1. Operaciones registra un PEDIDO con sus líneas (DETALLE_PEDIDO).
--   2. Al registrar cada línea, el sistema toma automáticamente lo que
--      haya en STOCK de esa señal. Lo que falte pasa a Marketing
--      (impresión) y luego a Producción (fabricación).
--   3. Marketing y Producción registran sus tiempos por etapa
--      (REGISTRO_TIEMPO). Esos registros avanzan los estados solos.
--   4. El estado global de cada línea se calcula a partir de los dos
--      estados de área; el pedido se puede marcar como entregado solo
--      cuando todas sus líneas están FINALIZADAS.
--  Zona horaria: ejecuta una vez  ALTER DATABASE <tu_bd> SET timezone = 'America/Lima';
--  Nota: los nombres de tablas/columnas van sin "ñ" ni tildes
--  (senal, diseno) para no tener que usar comillas en cada consulta.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. TIPOS (listas cerradas de valores)
-- ---------------------------------------------------------------------
CREATE TYPE area_trabajo    AS ENUM ('OPERACIONES', 'MARKETING', 'PRODUCCION');
CREATE TYPE prioridad_pedido AS ENUM ('BAJA', 'MEDIA', 'ALTA');
-- Estado por área de cada línea. NO REQUIERE = se cubrió todo con stock.
CREATE TYPE estado_area     AS ENUM ('PENDIENTE', 'EN PROCESO', 'TERMINADO', 'NO REQUIERE');
CREATE TYPE estado_global   AS ENUM ('PENDIENTE', 'EN PROCESO', 'FINALIZADO');
CREATE TYPE tipo_movimiento AS ENUM ('ENTRADA', 'SALIDA_PEDIDO', 'DEVOLUCION', 'AJUSTE');

-- ---------------------------------------------------------------------
-- 2. CATÁLOGOS
-- ---------------------------------------------------------------------
CREATE TABLE material (
    id_material  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre       VARCHAR(80) NOT NULL UNIQUE,
    activo       BOOLEAN     NOT NULL DEFAULT TRUE
);

CREATE TABLE vinil (
    id_vinil     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre       VARCHAR(80) NOT NULL UNIQUE,
    activo       BOOLEAN     NOT NULL DEFAULT TRUE
);

-- Clientes / tiendas que reciben las señales.
-- (Las áreas internas ya no van aquí: están en el tipo area_trabajo.)
CREATE TABLE cliente (
    id_cliente   INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre       VARCHAR(120) NOT NULL UNIQUE,
    activo       BOOLEAN      NOT NULL DEFAULT TRUE
);

-- Personas que solicitan, trabajan o entregan.
CREATE TABLE colaborador (
    id_colaborador INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre         VARCHAR(120) NOT NULL,
    area           area_trabajo NOT NULL,
    activo         BOOLEAN      NOT NULL DEFAULT TRUE
);

-- Catálogo de señales (producto terminado) con su stock disponible.
CREATE TABLE senal (
    id_senal     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre       VARCHAR(150)  NOT NULL,
    id_material  INT           NOT NULL REFERENCES material(id_material),
    id_vinil     INT           NOT NULL REFERENCES vinil(id_vinil),
    ancho_cm     NUMERIC(7,2)  NOT NULL CHECK (ancho_cm > 0),
    alto_cm      NUMERIC(7,2)  NOT NULL CHECK (alto_cm  > 0),
    area_m2      NUMERIC(10,4) GENERATED ALWAYS AS (ancho_cm * alto_cm / 10000.0) STORED,
    imagen_referencial   TEXT,                                   -- enlace de SharePoint
    stock        INT           NOT NULL DEFAULT 0 CHECK (stock >= 0),
    activo       BOOLEAN       NOT NULL DEFAULT TRUE,
    UNIQUE (nombre, id_material, id_vinil, ancho_cm, alto_cm)
);

-- Etapas de trabajo por área (base de los KPIs de tiempo).
-- es_final = la etapa cuya cantidad cuenta como "unidades terminadas".
CREATE TABLE etapa (
    id_etapa     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    area         area_trabajo NOT NULL CHECK (area <> 'OPERACIONES'),
    nombre       VARCHAR(60)  NOT NULL,
    orden        SMALLINT     NOT NULL,
    es_final     BOOLEAN      NOT NULL DEFAULT FALSE,
    UNIQUE (area, nombre),
    UNIQUE (area, orden)
);
-- Solo una etapa final por área
CREATE UNIQUE INDEX ux_etapa_final_por_area ON etapa(area) WHERE es_final;

-- ---------------------------------------------------------------------
-- 3. PEDIDOS
-- ---------------------------------------------------------------------
CREATE TABLE pedido (
    id_pedido               INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_cliente              INT              NOT NULL REFERENCES cliente(id_cliente),
    id_colaborador_solicita INT              REFERENCES colaborador(id_colaborador), -- Operaciones
    prioridad               prioridad_pedido NOT NULL DEFAULT 'BAJA',
    fecha_pedido            TIMESTAMPTZ      NOT NULL DEFAULT now(),
    fecha_requerida         DATE,
    observacion             TEXT,
    -- Entrega (tu columna "entregado")
    id_colaborador_entrega  INT              REFERENCES colaborador(id_colaborador),
    fecha_entrega           TIMESTAMPTZ,
    CHECK ((fecha_entrega IS NULL) = (id_colaborador_entrega IS NULL)),
    CHECK (fecha_entrega IS NULL OR fecha_entrega >= fecha_pedido)
);

CREATE TABLE detalle_pedido (
    id_detalle_pedido    INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_pedido            INT NOT NULL REFERENCES pedido(id_pedido) ON DELETE CASCADE,
    id_senal             INT NOT NULL REFERENCES senal(id_senal),
    cantidad             INT NOT NULL CHECK (cantidad > 0),
    -- Lo llena el sistema al insertar: cuánto salió del stock
    cantidad_desde_stock INT NOT NULL DEFAULT 0,
    cantidad_a_producir  INT GENERATED ALWAYS AS (cantidad - cantidad_desde_stock) STORED,
    estado_marketing     estado_area NOT NULL DEFAULT 'PENDIENTE',
    estado_produccion    estado_area NOT NULL DEFAULT 'PENDIENTE',
    -- Tu "estadoxglobal", calculado: nunca se desincroniza
    estado_global        estado_global GENERATED ALWAYS AS (
        CASE
            WHEN estado_marketing  IN ('TERMINADO','NO REQUIERE')
             AND estado_produccion IN ('TERMINADO','NO REQUIERE') THEN 'FINALIZADO'::estado_global
            WHEN estado_marketing = 'PENDIENTE'
             AND estado_produccion = 'PENDIENTE'                  THEN 'PENDIENTE'::estado_global
            ELSE 'EN PROCESO'::estado_global
        END) STORED,
    fecha_registro       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (cantidad_desde_stock BETWEEN 0 AND cantidad),
    UNIQUE (id_pedido, id_senal)          -- una línea por señal dentro del pedido
);
CREATE INDEX ix_detalle_pedido_pedido ON detalle_pedido(id_pedido);
CREATE INDEX ix_detalle_pedido_senal  ON detalle_pedido(id_senal);
CREATE INDEX ix_detalle_pendiente_mkt  ON detalle_pedido(estado_marketing)  WHERE estado_marketing  IN ('PENDIENTE','EN PROCESO');
CREATE INDEX ix_detalle_pendiente_prod ON detalle_pedido(estado_produccion) WHERE estado_produccion IN ('PENDIENTE','EN PROCESO');

-- ---------------------------------------------------------------------
-- 4. TIEMPOS (Marketing y Producción en una sola tabla)
--    Reemplaza a id_detalle_tiempoxseñal_marketing y su par de producción.
--    Cada fila = una sesión de trabajo de una etapa sobre una línea.
--    Puede haber varias filas por etapa (p. ej. impresión en 2 tandas).
-- ---------------------------------------------------------------------
CREATE TABLE registro_tiempo (
    id_registro_tiempo  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_detalle_pedido   INT         NOT NULL REFERENCES detalle_pedido(id_detalle_pedido) ON DELETE CASCADE,
    id_etapa            INT         NOT NULL REFERENCES etapa(id_etapa),
    id_colaborador      INT         REFERENCES colaborador(id_colaborador),
    inicio              TIMESTAMPTZ NOT NULL DEFAULT now(),
    fin                 TIMESTAMPTZ,                         -- NULL = en curso
    cantidad_procesada  INT         NOT NULL DEFAULT 0 CHECK (cantidad_procesada >= 0),
    duracion_min        NUMERIC(10,2) GENERATED ALWAYS AS
                        (EXTRACT(EPOCH FROM (fin - inicio)) / 60.0) STORED,
    observacion         TEXT,
    CHECK (fin IS NULL OR fin >= inicio)
);
CREATE INDEX ix_registro_tiempo_detalle ON registro_tiempo(id_detalle_pedido);
CREATE INDEX ix_registro_tiempo_etapa   ON registro_tiempo(id_etapa, inicio);

-- ---------------------------------------------------------------------
-- 5. KARDEX DE STOCK (toda variación de stock pasa por aquí)
-- ---------------------------------------------------------------------
CREATE TABLE movimiento_stock (
    id_movimiento     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_senal          INT             NOT NULL REFERENCES senal(id_senal),
    tipo              tipo_movimiento NOT NULL,
    cantidad          INT             NOT NULL CHECK (cantidad <> 0), -- + entra / - sale
    id_detalle_pedido INT REFERENCES detalle_pedido(id_detalle_pedido)
                          ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    id_colaborador    INT REFERENCES colaborador(id_colaborador),
    fecha             TIMESTAMPTZ     NOT NULL DEFAULT now(),
    observacion       TEXT,
    CHECK (tipo IN ('ENTRADA','DEVOLUCION') AND cantidad > 0
        OR tipo = 'SALIDA_PEDIDO' AND cantidad < 0
        OR tipo = 'AJUSTE')
);
CREATE INDEX ix_movimiento_senal ON movimiento_stock(id_senal, fecha);

-- =====================================================================
-- 6. REGLAS DE NEGOCIO (triggers)
-- =====================================================================

-- 6.1 Cada movimiento actualiza el stock de la señal.
--     El CHECK (stock >= 0) de senal impide quedar en negativo.
CREATE FUNCTION fn_movimiento_actualiza_stock() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE senal SET stock = stock + NEW.cantidad WHERE id_senal = NEW.id_senal;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_movimiento_actualiza_stock
AFTER INSERT ON movimiento_stock
FOR EACH ROW EXECUTE FUNCTION fn_movimiento_actualiza_stock();

-- Los movimientos no se editan ni borran: se corrigen con un AJUSTE.
CREATE FUNCTION fn_bloquear_cambio() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    -- Única excepción: al borrar la línea de pedido, la referencia queda en NULL
    IF TG_OP = 'UPDATE' AND NEW.id_detalle_pedido IS NULL
       AND (to_jsonb(NEW) - 'id_detalle_pedido') = (to_jsonb(OLD) - 'id_detalle_pedido') THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION '% no se puede modificar ni borrar; registre un movimiento de AJUSTE', TG_TABLE_NAME;
END $$;

--CREATE TRIGGER trg_movimiento_inmutable
--BEFORE UPDATE OR DELETE ON movimiento_stock
--FOR EACH ROW EXECUTE FUNCTION fn_bloquear_cambio();

-- 6.2 Al registrar una línea de pedido: tomar stock y fijar estados.
--CREATE FUNCTION fn_detalle_asigna_stock() RETURNS trigger
--LANGUAGE plpgsql AS $$
--DECLARE--
--    v_stock INT;
--BEGIN
    -- Bloquea la fila de la señal para que dos pedidos simultáneos
    -- no tomen el mismo stock.
--    SELECT stock INTO v_stock FROM senal WHERE id_senal = NEW.id_senal FOR UPDATE;

--    NEW.cantidad_desde_stock := LEAST(v_stock, NEW.cantidad);

--    IF NEW.cantidad_desde_stock > 0 THEN--
        INSERT INTO movimiento_stock (id_senal, tipo, cantidad, id_detalle_pedido, observacion)
        VALUES (NEW.id_senal, 'SALIDA_PEDIDO', -NEW.cantidad_desde_stock,
                NEW.id_detalle_pedido, 'Asignado automáticamente al pedido ' || NEW.id_pedido);
--    END IF;

--    IF NEW.cantidad_desde_stock = NEW.cantidad THEN
        -- Todo salió de stock: ni Marketing ni Producción intervienen
--        NEW.estado_marketing  := 'NO REQUIERE';
--        NEW.estado_produccion := 'NO REQUIERE';
--    ELSE
--        NEW.estado_marketing  := 'PENDIENTE';
--        NEW.estado_produccion := 'PENDIENTE';
--    END IF;
--    RETURN NEW;
--END $$;

CREATE TRIGGER trg_detalle_asigna_stock
BEFORE INSERT ON detalle_pedido
FOR EACH ROW EXECUTE FUNCTION fn_detalle_asigna_stock();

-- 6.3 No cambiar señal/cantidad de una línea ya creada
--     (para no descuadrar el stock): borrar y volver a crear.
CREATE FUNCTION fn_detalle_bloquea_cambios() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.id_senal <> OLD.id_senal OR NEW.cantidad <> OLD.cantidad
       OR NEW.cantidad_desde_stock <> OLD.cantidad_desde_stock
       OR NEW.id_pedido <> OLD.id_pedido THEN
        RAISE EXCEPTION 'No se puede cambiar señal, cantidad o pedido de la línea %. Elimínela y regístrela de nuevo.',
            OLD.id_detalle_pedido;
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_detalle_bloquea_cambios
BEFORE UPDATE ON detalle_pedido
FOR EACH ROW EXECUTE FUNCTION fn_detalle_bloquea_cambios();

-- 6.4 Si se elimina una línea, el stock que tomó vuelve.
CREATE FUNCTION fn_detalle_devuelve_stock() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.cantidad_desde_stock > 0 THEN
        INSERT INTO movimiento_stock (id_senal, tipo, cantidad, observacion)
        VALUES (OLD.id_senal, 'DEVOLUCION', OLD.cantidad_desde_stock,
                'Devolución: línea ' || OLD.id_detalle_pedido || ' del pedido ' || OLD.id_pedido || ' eliminada');
    END IF;
    RETURN OLD;
END $$;

CREATE TRIGGER trg_detalle_devuelve_stock
AFTER DELETE ON detalle_pedido
FOR EACH ROW EXECUTE FUNCTION fn_detalle_devuelve_stock();

-- 6.4b Un pedido ya entregado no se borra (su stock ya salió físicamente).
CREATE FUNCTION fn_pedido_bloquea_borrado() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.fecha_entrega IS NOT NULL THEN
        RAISE EXCEPTION 'El pedido % ya fue entregado y no se puede eliminar.', OLD.id_pedido;
    END IF;
    RETURN OLD;
END $$;

CREATE TRIGGER trg_pedido_bloquea_borrado
BEFORE DELETE ON pedido
FOR EACH ROW EXECUTE FUNCTION fn_pedido_bloquea_borrado();

-- 6.5 Registrar tiempos mueve el estado del área:
--     - primer registro             -> EN PROCESO
--     - unidades de la etapa final  >= cantidad_a_producir -> TERMINADO
CREATE FUNCTION fn_tiempo_actualiza_estado() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_area     area_trabajo;
    v_estado   estado_area;
    v_meta     INT;
    v_hechas   INT;
    v_nuevo    estado_area;
BEGIN
    SELECT e.area INTO v_area FROM etapa e WHERE e.id_etapa = NEW.id_etapa;

    SELECT CASE v_area WHEN 'MARKETING' THEN d.estado_marketing ELSE d.estado_produccion END,
           d.cantidad_a_producir
      INTO v_estado, v_meta
      FROM detalle_pedido d
     WHERE d.id_detalle_pedido = NEW.id_detalle_pedido
       FOR UPDATE;

    IF v_estado = 'NO REQUIERE' THEN
        RAISE EXCEPTION 'La línea % se cubrió con stock; % no requiere registrar tiempos.',
            NEW.id_detalle_pedido, v_area;
    END IF;

    SELECT COALESCE(SUM(r.cantidad_procesada), 0) INTO v_hechas
      FROM registro_tiempo r
      JOIN etapa e ON e.id_etapa = r.id_etapa
     WHERE r.id_detalle_pedido = NEW.id_detalle_pedido
       AND e.area = v_area AND e.es_final AND r.fin IS NOT NULL;

    v_nuevo := CASE WHEN v_hechas >= v_meta THEN 'TERMINADO' ELSE 'EN PROCESO' END;

    IF v_nuevo IS DISTINCT FROM v_estado THEN
        IF v_area = 'MARKETING' THEN
            UPDATE detalle_pedido SET estado_marketing  = v_nuevo WHERE id_detalle_pedido = NEW.id_detalle_pedido;
        ELSE
            UPDATE detalle_pedido SET estado_produccion = v_nuevo WHERE id_detalle_pedido = NEW.id_detalle_pedido;
        END IF;
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_tiempo_actualiza_estado
AFTER INSERT OR UPDATE ON registro_tiempo
FOR EACH ROW EXECUTE FUNCTION fn_tiempo_actualiza_estado();

-- 6.6 Solo se entrega un pedido con todas sus líneas FINALIZADAS.
CREATE FUNCTION fn_pedido_valida_entrega() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.fecha_entrega IS NOT NULL AND OLD.fecha_entrega IS NULL THEN
        IF NOT EXISTS (SELECT 1 FROM detalle_pedido WHERE id_pedido = NEW.id_pedido) THEN
            RAISE EXCEPTION 'El pedido % no tiene líneas.', NEW.id_pedido;
        END IF;
        IF EXISTS (SELECT 1 FROM detalle_pedido
                    WHERE id_pedido = NEW.id_pedido AND estado_global <> 'FINALIZADO') THEN
            RAISE EXCEPTION 'El pedido % tiene señales sin finalizar; no se puede marcar como entregado.', NEW.id_pedido;
        END IF;
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_pedido_valida_entrega
BEFORE UPDATE OF fecha_entrega ON pedido
FOR EACH ROW EXECUTE FUNCTION fn_pedido_valida_entrega();

-- =====================================================================
-- 7. VISTAS DE TRABAJO
-- =====================================================================

-- 7.1 Resumen por pedido (tablero de Operaciones)
CREATE VIEW v_pedido_resumen AS
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
       p.fecha_entrega
FROM pedido p
JOIN cliente c           ON c.id_cliente = p.id_cliente
LEFT JOIN detalle_pedido d ON d.id_pedido = p.id_pedido
LEFT JOIN colaborador ce ON ce.id_colaborador = p.id_colaborador_entrega
GROUP BY p.id_pedido, c.nombre, ce.nombre;

-- 7.2 Bandeja de Marketing y de Producción (lo que falta hacer)
CREATE VIEW v_bandeja_marketing AS
SELECT d.id_detalle_pedido, p.id_pedido, p.prioridad, p.fecha_pedido, c.nombre AS cliente,
       s.nombre AS senal, m.nombre AS material, v.nombre AS vinil,
       s.ancho_cm, s.alto_cm, imagen_url,
       d.cantidad_a_producir, d.estado_marketing
FROM detalle_pedido d
JOIN pedido p   ON p.id_pedido  = d.id_pedido
JOIN cliente c  ON c.id_cliente = p.id_cliente
JOIN senal s    ON s.id_senal   = d.id_senal
JOIN material m ON m.id_material = s.id_material
JOIN vinil v    ON v.id_vinil    = s.id_vinil
WHERE d.estado_marketing IN ('PENDIENTE','EN PROCESO');

CREATE VIEW v_bandeja_produccion AS
SELECT d.id_detalle_pedido, p.id_pedido, p.prioridad, p.fecha_pedido, c.nombre AS cliente,
       s.nombre AS senal, m.nombre AS material, v.nombre AS vinil,
       s.ancho_cm, s.alto_cm, imagen_url,
       d.cantidad_a_producir, d.estado_marketing, d.estado_produccion
FROM detalle_pedido d
JOIN pedido p   ON p.id_pedido  = d.id_pedido
JOIN cliente c  ON c.id_cliente = p.id_cliente
JOIN senal s    ON s.id_senal   = d.id_senal
JOIN material m ON m.id_material = s.id_material
JOIN vinil v    ON v.id_vinil    = s.id_vinil
WHERE d.estado_produccion IN ('PENDIENTE','EN PROCESO');

-- 7.3 Tiempos por línea en formato "ancho", como tu tabla original.
--     Primer inicio / último fin de cada etapa y unidades de la etapa final.
CREATE VIEW v_tiempo_marketing AS
SELECT r.id_detalle_pedido,
       MIN(r.inicio) FILTER (WHERE e.nombre = 'DISENO')    AS diseno_inicio,
       MAX(r.fin)    FILTER (WHERE e.nombre = 'DISENO')    AS diseno_fin,
       MIN(r.inicio) FILTER (WHERE e.nombre = 'ENCUADRE')  AS encuadre_inicio,
       MAX(r.fin)    FILTER (WHERE e.nombre = 'ENCUADRE')  AS encuadre_fin,
       MIN(r.inicio) FILTER (WHERE e.nombre = 'IMPRESION') AS impresion_inicio,
       MAX(r.fin)    FILTER (WHERE e.nombre = 'IMPRESION') AS impresion_fin,
       COALESCE(SUM(r.cantidad_procesada) FILTER (WHERE e.es_final AND r.fin IS NOT NULL), 0) AS cantidad_impresa,
       SUM(r.duracion_min)                                  AS minutos_totales
FROM registro_tiempo r
JOIN etapa e ON e.id_etapa = r.id_etapa AND e.area = 'MARKETING'
GROUP BY r.id_detalle_pedido;

CREATE VIEW v_tiempo_produccion AS
SELECT r.id_detalle_pedido,
       MIN(r.inicio) FILTER (WHERE e.nombre = 'CORTE')       AS corte_inicio,
       MAX(r.fin)    FILTER (WHERE e.nombre = 'CORTE')       AS corte_fin,
       MIN(r.inicio) FILTER (WHERE e.nombre = 'ARMADO')      AS armado_inicio,
       MAX(r.fin)    FILTER (WHERE e.nombre = 'ARMADO')      AS armado_fin,
       MIN(r.inicio) FILTER (WHERE e.nombre = 'CONTROL Y EMBALAJE') AS control_inicio,
       MAX(r.fin)    FILTER (WHERE e.nombre = 'CONTROL Y EMBALAJE') AS control_fin,
       COALESCE(SUM(r.cantidad_procesada) FILTER (WHERE e.es_final AND r.fin IS NOT NULL), 0) AS cantidad_terminada,
       SUM(r.duracion_min)                                   AS minutos_totales
FROM registro_tiempo r
JOIN etapa e ON e.id_etapa = r.id_etapa AND e.area = 'PRODUCCION'
GROUP BY r.id_detalle_pedido;

-- =====================================================================
-- 8. VISTAS DE KPI
-- =====================================================================

-- 8.1 Rendimiento por etapa (Marketing y Producción)
CREATE VIEW v_kpi_etapa AS
SELECT e.area, e.orden, e.nombre AS etapa,
       COUNT(r.*)                                   AS sesiones,
       COUNT(DISTINCT r.id_detalle_pedido)          AS lineas_trabajadas,
       ROUND(SUM(r.duracion_min), 1)                AS minutos_totales,
       ROUND(AVG(r.duracion_min), 1)                AS minutos_promedio_sesion,
       SUM(r.cantidad_procesada)                    AS unidades,
       ROUND(SUM(r.duracion_min) / NULLIF(SUM(r.cantidad_procesada), 0), 2) AS minutos_por_unidad,
       ROUND(SUM(r.cantidad_procesada * s.area_m2), 3)                      AS m2_procesados
FROM etapa e
LEFT JOIN registro_tiempo r ON r.id_etapa = e.id_etapa AND r.fin IS NOT NULL
LEFT JOIN detalle_pedido d  ON d.id_detalle_pedido = r.id_detalle_pedido
LEFT JOIN senal s           ON s.id_senal = d.id_senal
GROUP BY e.area, e.orden, e.nombre;

-- 8.2 Productividad por colaborador y mes
CREATE VIEW v_kpi_colaborador_mes AS
SELECT date_trunc('month', r.inicio)::date     AS mes,
       e.area, co.nombre                       AS colaborador,
       COUNT(*)                                AS sesiones,
       ROUND(SUM(r.duracion_min) / 60.0, 2)    AS horas,
       SUM(r.cantidad_procesada)               AS unidades,
       ROUND(SUM(r.cantidad_procesada) / NULLIF(SUM(r.duracion_min) / 60.0, 0), 2) AS unidades_por_hora
FROM registro_tiempo r
JOIN etapa e        ON e.id_etapa = r.id_etapa
LEFT JOIN colaborador co ON co.id_colaborador = r.id_colaborador
WHERE r.fin IS NOT NULL
GROUP BY 1, 2, 3;

-- 8.3 Tiempo de ciclo por línea: espera antes de empezar y duración por área
CREATE VIEW v_kpi_ciclo_linea AS
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

-- 8.4 Cobertura con stock (cuánto trabajo se ahorró) por mes
CREATE VIEW v_kpi_cobertura_stock AS
SELECT date_trunc('month', d.fecha_registro)::date AS mes,
       SUM(d.cantidad)             AS unidades_pedidas,
       SUM(d.cantidad_desde_stock) AS unidades_desde_stock,
       SUM(d.cantidad_a_producir)  AS unidades_producidas,
       ROUND(100.0 * SUM(d.cantidad_desde_stock) / NULLIF(SUM(d.cantidad), 0), 1) AS cobertura_stock_pct
FROM detalle_pedido d
GROUP BY 1;

COMMIT;
