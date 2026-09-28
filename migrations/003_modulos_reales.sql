-- Fase 3: auditoria, valor de alicuota configurable, finanzas, control de acceso y movilidad.
-- Todas las tablas nuevas activan RLS para que la API publica de Supabase (clave anon) no las exponga.

-- H. Rol de guardia para el control de acceso.
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_role_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_role_check
  CHECK (role IN ('admin_general', 'admin_conjunto', 'tesorero', 'guardia', 'condomino'));

-- E. Auditoria escrita por el servidor (no editable desde la app).
CREATE TABLE IF NOT EXISTS auditoria (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  usuario_nombre TEXT,
  role TEXT,
  modulo TEXT NOT NULL,
  accion TEXT NOT NULL,
  detalle TEXT,
  metodo TEXT NOT NULL,
  ruta TEXT NOT NULL,
  status INTEGER NOT NULL,
  ip TEXT
);
CREATE INDEX IF NOT EXISTS auditoria_created_at_idx ON auditoria (created_at DESC);
CREATE INDEX IF NOT EXISTS auditoria_modulo_idx ON auditoria (modulo);
ALTER TABLE auditoria ENABLE ROW LEVEL SECURITY;

-- F. Valor de alicuota por anio, general (torre_id NULL) o especifico de una torre.
-- Rige desde el anio indicado hasta que se defina otro valor posterior.
CREATE TABLE IF NOT EXISTS alicuota_valores (
  id SERIAL PRIMARY KEY,
  torre_id INTEGER REFERENCES torres(id) ON DELETE CASCADE,
  anio INTEGER NOT NULL CHECK (anio BETWEEN 2000 AND 2200),
  valor NUMERIC(12, 2) NOT NULL CHECK (valor > 0),
  updated_by INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS alicuota_valores_torre_anio_key ON alicuota_valores (COALESCE(torre_id, 0), anio);
ALTER TABLE alicuota_valores ENABLE ROW LEVEL SECURITY;

-- Valor que estaba fijo en el codigo (45) como base general.
INSERT INTO alicuota_valores (torre_id, anio, valor)
SELECT NULL, 2020, 45
WHERE NOT EXISTS (SELECT 1 FROM alicuota_valores WHERE torre_id IS NULL);

-- Movimientos financieros manuales (antes solo en el navegador).
CREATE TABLE IF NOT EXISTS finanzas_movimientos (
  id SERIAL PRIMARY KEY,
  fecha DATE NOT NULL,
  concepto TEXT NOT NULL,
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('ingreso', 'gasto')),
  valor NUMERIC(12, 2) NOT NULL CHECK (valor > 0),
  estado VARCHAR(10) NOT NULL DEFAULT 'pagado' CHECK (estado IN ('pendiente', 'pagado')),
  alcance VARCHAR(10) NOT NULL CHECK (alcance IN ('conjunto', 'torre')),
  torre_id INTEGER REFERENCES torres(id) ON DELETE CASCADE,
  creado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT finanzas_movimientos_torre_check CHECK ((alcance = 'torre') = (torre_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS finanzas_movimientos_fecha_idx ON finanzas_movimientos (fecha DESC);
ALTER TABLE finanzas_movimientos ENABLE ROW LEVEL SECURITY;

-- Registro de visitantes de la guardia (antes solo en el navegador).
CREATE TABLE IF NOT EXISTS accesos_guardia (
  id SERIAL PRIMARY KEY,
  torre TEXT NOT NULL,
  departamento TEXT NOT NULL,
  duenio_contactado TEXT NOT NULL,
  visitante TEXT NOT NULL,
  documento TEXT,
  placa_vehiculo TEXT,
  hora_ingreso_vehiculo TEXT,
  autorizacion VARCHAR(12) NOT NULL DEFAULT 'pendiente' CHECK (autorizacion IN ('pendiente', 'autorizado', 'rechazado')),
  estado VARCHAR(12) NOT NULL DEFAULT 'en_porteria' CHECK (estado IN ('en_porteria', 'ingreso', 'salio', 'rechazado')),
  observacion TEXT,
  ingreso_at TIMESTAMPTZ,
  salida_at TIMESTAMPTZ,
  registrado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS accesos_guardia_created_at_idx ON accesos_guardia (created_at DESC);
ALTER TABLE accesos_guardia ENABLE ROW LEVEL SECURITY;

-- Vehiculo y parqueadero por persona (antes solo en el navegador).
ALTER TABLE personas ADD COLUMN IF NOT EXISTS vehiculo TEXT;
ALTER TABLE personas ADD COLUMN IF NOT EXISTS parqueadero TEXT;

-- Tabla sin uso en el codigo; se mantiene intacta. Solo se asegura que no quede expuesta.
DO $$
BEGIN
  IF to_regclass('public.cobros') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE cobros ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;
