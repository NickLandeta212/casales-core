-- Portal de pagos: cada pago aprobado genera su movimiento en finanzas.
--   Pago de departamento (alicuota o multa) -> ingreso en las finanzas de su torre.
--   Pago de una torre al conjunto          -> ingreso del conjunto + gasto de la torre.

ALTER TABLE finanzas_movimientos ADD COLUMN IF NOT EXISTS origen VARCHAR(20) NOT NULL DEFAULT 'manual';
ALTER TABLE finanzas_movimientos ADD COLUMN IF NOT EXISTS origen_id INTEGER;
ALTER TABLE finanzas_movimientos DROP CONSTRAINT IF EXISTS finanzas_movimientos_origen_check;
ALTER TABLE finanzas_movimientos ADD CONSTRAINT finanzas_movimientos_origen_check
  CHECK (origen IN ('manual', 'pago_alicuota', 'pago_multa', 'pago_torre'));
ALTER TABLE finanzas_movimientos DROP CONSTRAINT IF EXISTS finanzas_movimientos_origen_id_check;
ALTER TABLE finanzas_movimientos ADD CONSTRAINT finanzas_movimientos_origen_id_check
  CHECK ((origen = 'manual') = (origen_id IS NULL));

-- Un pago aprobado genera como maximo un movimiento por alcance (el de torre genera dos: conjunto y torre).
CREATE UNIQUE INDEX IF NOT EXISTS finanzas_movimientos_origen_key
  ON finanzas_movimientos (origen, origen_id, alcance)
  WHERE origen <> 'manual';

-- Pagos aprobados antes de este cambio.
INSERT INTO finanzas_movimientos (fecha, concepto, tipo, valor, estado, alcance, torre_id, creado_por, origen, origen_id)
SELECT COALESCE(p.aprobado_at, p.updated_at)::date,
       'Alicuota ' || p.mes || '/' || p.anio || ' - ' || d.numero,
       'ingreso', p.valor, 'pagado', 'torre', p.torre_id, p.aprobado_por, 'pago_alicuota', p.id
FROM pagos_alicuotas p
INNER JOIN departamentos d ON d.id = p.departamento_id
WHERE p.estado = 'aprobado'
ON CONFLICT DO NOTHING;

INSERT INTO finanzas_movimientos (fecha, concepto, tipo, valor, estado, alcance, torre_id, creado_por, origen, origen_id)
SELECT COALESCE(p.revisado_at, p.updated_at)::date,
       'Pago de multas #' || p.id || ' - ' || d.numero,
       'ingreso', p.total, 'pagado', 'torre', d.torre_id, p.revisado_por, 'pago_multa', p.id
FROM pagos_multas p
INNER JOIN departamentos d ON d.id = p.departamento_id
WHERE p.estado = 'aprobado'
ON CONFLICT DO NOTHING;

INSERT INTO finanzas_movimientos (fecha, concepto, tipo, valor, estado, alcance, torre_id, creado_por, origen, origen_id)
SELECT COALESCE(p.aprobado_at, p.updated_at)::date,
       'Alicuota Torre ' || t.numero || ' - ' || p.mes || '/' || p.anio,
       'ingreso', p.valor, 'pagado', 'conjunto', NULL, p.aprobado_por, 'pago_torre', p.id
FROM pagos_alicuotas_torres p
INNER JOIN torres t ON t.id = p.torre_id
WHERE p.estado = 'aprobado'
ON CONFLICT DO NOTHING;

INSERT INTO finanzas_movimientos (fecha, concepto, tipo, valor, estado, alcance, torre_id, creado_por, origen, origen_id)
SELECT COALESCE(p.aprobado_at, p.updated_at)::date,
       'Alicuota pagada al conjunto - ' || p.mes || '/' || p.anio,
       'gasto', p.valor, 'pagado', 'torre', p.torre_id, p.aprobado_por, 'pago_torre', p.id
FROM pagos_alicuotas_torres p
WHERE p.estado = 'aprobado'
ON CONFLICT DO NOTHING;
