-- Cargos extraordinarios del mes y certificados de paz y salvo.
-- La alicuota ordinaria sigue igual: se calcula sola con el valor vigente de alicuota_valores.
-- Un cargo extraordinario lo emite la administracion para todos los departamentos (o los de una torre)
-- y puede revertirse con motivo mientras ningun departamento lo haya pagado.

CREATE TABLE IF NOT EXISTS cargos_emisiones (
  id SERIAL PRIMARY KEY,
  anio INTEGER NOT NULL CHECK (anio BETWEEN 2000 AND 2200),
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  concepto VARCHAR(150) NOT NULL,
  valor NUMERIC(12, 2) NOT NULL CHECK (valor > 0),
  -- NULL = todas las torres.
  torre_id INTEGER REFERENCES torres(id) ON DELETE CASCADE,
  estado VARCHAR(10) NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'revertida')),
  motivo_reversion TEXT,
  creado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  revertido_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  revertido_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cargos_emisiones_reversion_check CHECK ((estado = 'revertida') = (motivo_reversion IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS cargos_emisiones_periodo_idx ON cargos_emisiones (anio DESC, mes DESC);
ALTER TABLE cargos_emisiones ENABLE ROW LEVEL SECURITY;

-- Ciclo de vida igual al de las multas: pendiente -> en_pago -> pagado. Si se revierte la emision, anulado.
CREATE TABLE IF NOT EXISTS cargos (
  id SERIAL PRIMARY KEY,
  emision_id INTEGER NOT NULL REFERENCES cargos_emisiones(id) ON DELETE CASCADE,
  departamento_id INTEGER NOT NULL REFERENCES departamentos(id) ON DELETE CASCADE,
  valor NUMERIC(12, 2) NOT NULL CHECK (valor > 0),
  estado VARCHAR(10) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_pago', 'pagado', 'anulado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (emision_id, departamento_id)
);
CREATE INDEX IF NOT EXISTS cargos_departamento_idx ON cargos (departamento_id, estado);
ALTER TABLE cargos ENABLE ROW LEVEL SECURITY;

-- Pago de uno o varios cargos con un comprobante; lo revisa el tesorero de la torre.
CREATE TABLE IF NOT EXISTS pagos_cargos (
  id SERIAL PRIMARY KEY,
  departamento_id INTEGER NOT NULL REFERENCES departamentos(id) ON DELETE CASCADE,
  total NUMERIC(12, 2) NOT NULL CHECK (total > 0),
  comprobante_url TEXT NOT NULL,
  email_destinatario TEXT,
  estado VARCHAR(12) NOT NULL DEFAULT 'en_proceso' CHECK (estado IN ('en_proceso', 'aprobado', 'rechazado')),
  motivo_rechazo TEXT,
  revisado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  revisado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS pagos_cargos_departamento_idx ON pagos_cargos (departamento_id, created_at DESC);
ALTER TABLE pagos_cargos ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS pagos_cargos_detalle (
  id SERIAL PRIMARY KEY,
  pago_cargo_id INTEGER NOT NULL REFERENCES pagos_cargos(id) ON DELETE CASCADE,
  cargo_id INTEGER NOT NULL REFERENCES cargos(id) ON DELETE CASCADE,
  monto NUMERIC(12, 2) NOT NULL,
  UNIQUE (pago_cargo_id, cargo_id)
);
CREATE INDEX IF NOT EXISTS pagos_cargos_detalle_cargo_idx ON pagos_cargos_detalle (cargo_id);
ALTER TABLE pagos_cargos_detalle ENABLE ROW LEVEL SECURITY;

-- El pago aprobado de un cargo tambien entra a las finanzas de la torre.
ALTER TABLE finanzas_movimientos DROP CONSTRAINT IF EXISTS finanzas_movimientos_origen_check;
ALTER TABLE finanzas_movimientos ADD CONSTRAINT finanzas_movimientos_origen_check
  CHECK (origen IN ('manual', 'pago_alicuota', 'pago_multa', 'pago_torre', 'pago_cargo'));

-- Certificados de paz y salvo: numerados y con quien los emitio, para el historial.
CREATE TABLE IF NOT EXISTS certificados (
  id SERIAL PRIMARY KEY,
  departamento_id INTEGER NOT NULL REFERENCES departamentos(id) ON DELETE CASCADE,
  tipo VARCHAR(20) NOT NULL DEFAULT 'paz_y_salvo' CHECK (tipo IN ('paz_y_salvo')),
  titular TEXT,
  emitido_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS certificados_departamento_idx ON certificados (departamento_id, created_at DESC);
ALTER TABLE certificados ENABLE ROW LEVEL SECURITY;
