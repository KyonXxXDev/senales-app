-- =====================================================================
--  MIGRACIÓN: Stock automático al terminar producción/marketing
--             + Tabla de notificaciones in-app
--  PostgreSQL 14+
--  Aplicar sobre la BD existente (idempotente: usa IF NOT EXISTS y
--  DO $$...END IF donde aplica)
-- =====================================================================

BEGIN;

-- -------------------------------------------------------------------
-- 1. Nueva columna en movimiento_stock: origen_area
--    Indica qué área (MARKETING | PRODUCCION) generó el movimiento
--    cuando el ingreso es automático por finalización de producción.
-- -------------------------------------------------------------------
ALTER TABLE movimiento_stock
    ADD COLUMN IF NOT EXISTS origen_area area_trabajo;

-- Índice para la validación de duplicados (detalle + área + ENTRADA)
CREATE INDEX IF NOT EXISTS ix_movstock_detalle_area
    ON movimiento_stock(id_detalle_pedido, origen_area)
    WHERE tipo = 'ENTRADA' AND origen_area IS NOT NULL;

-- -------------------------------------------------------------------
-- 2. Columna observacion_linea en detalle_pedido
--    Permite que Operaciones deje anotaciones por línea al editarla.
-- -------------------------------------------------------------------
ALTER TABLE detalle_pedido
    ADD COLUMN IF NOT EXISTS observacion_linea TEXT;

-- -------------------------------------------------------------------
-- 3. Columna email en colaborador (opcional, para futuras alertas)
-- -------------------------------------------------------------------
ALTER TABLE colaborador
    ADD COLUMN IF NOT EXISTS email VARCHAR(180);

-- -------------------------------------------------------------------
-- 4. Tabla de notificaciones in-app
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notificacion (
    id_notificacion  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_colaborador   INT NOT NULL REFERENCES colaborador(id_colaborador) ON DELETE CASCADE,
    tipo             VARCHAR(20)  NOT NULL DEFAULT 'INFO'
                     CHECK (tipo IN ('INFO', 'ALERTA', 'URGENTE')),
    titulo           VARCHAR(200) NOT NULL,
    mensaje          TEXT         NOT NULL,
    url              TEXT,                          -- enlace de contexto
    leida            BOOLEAN      NOT NULL DEFAULT FALSE,
    fecha_creacion   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_lectura    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_notif_colaborador_no_leida
    ON notificacion(id_colaborador, fecha_creacion DESC)
    WHERE leida = FALSE;

-- -------------------------------------------------------------------
-- 5. El campo estado_global en detalle_pedido es GENERATED ALWAYS,
--    por lo que no puede actualizarse con UPDATE directamente.
--    La lógica del servicio (sincronizarEstadoArea) ya usa una
--    expresión CASE igual a la definida en el esquema, por lo que
--    el campo GENERATED se mantiene consistente sin tocarla.
--    ➜ No se requiere ningún cambio adicional en la tabla.
-- -------------------------------------------------------------------

COMMIT;
