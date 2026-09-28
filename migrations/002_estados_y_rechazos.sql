-- Fase 2: cambio obligatorio de contrasena, estados de multas y rechazo de pagos/reservas.

-- A. Cambio de contrasena obligatorio.
-- Todas las cuentas de condomino se crearon con la misma contrasena temporal.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE usuarios SET must_change_password = TRUE WHERE role = 'condomino';

-- D. Las multas ya no se borran al pagarse: pasan por pendiente -> en_pago -> pagada.
ALTER TABLE multas ADD COLUMN IF NOT EXISTS estado VARCHAR(20) NOT NULL DEFAULT 'pendiente';
ALTER TABLE multas DROP CONSTRAINT IF EXISTS multas_estado_check;
ALTER TABLE multas ADD CONSTRAINT multas_estado_check CHECK (estado IN ('pendiente', 'en_pago', 'pagada'));

-- Multas incluidas en un pago que sigue en proceso.
UPDATE multas m
SET estado = 'en_pago'
FROM pagos_multas_detalle pmd
INNER JOIN pagos_multas p ON p.id = pmd.pago_multa_id
WHERE pmd.multa_id = m.id
  AND p.estado = 'en_proceso';

CREATE INDEX IF NOT EXISTS pagos_multas_detalle_multa_id_idx ON pagos_multas_detalle (multa_id);

-- C. Rechazo de pagos de multas.
ALTER TABLE pagos_multas ADD COLUMN IF NOT EXISTS motivo_rechazo TEXT;
ALTER TABLE pagos_multas ADD COLUMN IF NOT EXISTS revisado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE pagos_multas ADD COLUMN IF NOT EXISTS revisado_at TIMESTAMPTZ;
ALTER TABLE pagos_multas DROP CONSTRAINT IF EXISTS pagos_multas_estado_check;
ALTER TABLE pagos_multas ADD CONSTRAINT pagos_multas_estado_check CHECK (estado IN ('en_proceso', 'aprobado', 'rechazado'));

-- C. Rechazo de pagos de alicuotas (departamentos y torres).
ALTER TABLE pagos_alicuotas ADD COLUMN IF NOT EXISTS motivo_rechazo TEXT;
ALTER TABLE pagos_alicuotas DROP CONSTRAINT IF EXISTS pagos_alicuotas_estado_check;
ALTER TABLE pagos_alicuotas ADD CONSTRAINT pagos_alicuotas_estado_check CHECK (estado IN ('en_revision', 'aprobado', 'rechazado'));

ALTER TABLE pagos_alicuotas_torres ADD COLUMN IF NOT EXISTS motivo_rechazo TEXT;
ALTER TABLE pagos_alicuotas_torres DROP CONSTRAINT IF EXISTS pagos_alicuotas_torres_estado_check;
ALTER TABLE pagos_alicuotas_torres ADD CONSTRAINT pagos_alicuotas_torres_estado_check CHECK (estado IN ('en_revision', 'aprobado', 'rechazado'));

-- C. Rechazo de reservas. Una reserva rechazada libera la fecha.
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS motivo_rechazo TEXT;
ALTER TABLE reservas DROP CONSTRAINT IF EXISTS reservas_estado_check;
ALTER TABLE reservas ADD CONSTRAINT reservas_estado_check CHECK (estado IN ('disponible', 'en_proceso', 'reservado', 'rechazado'));
ALTER TABLE reservas DROP CONSTRAINT IF EXISTS reservas_fecha_key;
CREATE UNIQUE INDEX IF NOT EXISTS reservas_fecha_activa_key ON reservas (fecha) WHERE estado <> 'rechazado';
