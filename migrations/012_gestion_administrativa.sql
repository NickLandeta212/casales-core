-- Gestion administrativa (prioridad media):
--   1. Proveedores y egresos (ordenes de compra / gastos con comprobante y anulacion).
--   2. Presupuesto anual por categoria.
--   3. Asambleas con orden del dia.
--   4. Mantenimientos programados con recordatorio.
--   5. Archivo de documentos (reglamento, actas, contratos).
--   6. Bitacora de novedades de la guardia con fotos.
-- Los archivos (comprobantes, documentos y fotos) viven en el bucket privado 'comprobantes' (migracion 005).

-- 1. Proveedores -----------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS proveedores (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  -- RUC (13 digitos) o cedula (10 digitos) del proveedor.
  ruc VARCHAR(13) NOT NULL UNIQUE CHECK (ruc ~ '^[0-9]{10}([0-9]{3})?$'),
  telefono VARCHAR(30),
  email VARCHAR(120),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;

-- Egresos: nacen pendientes (orden de compra / por pagar) o pagados. Al pagarse entran a finanzas como gasto;
-- si se anulan, el gasto sale de finanzas pero el egreso queda con su motivo para el historial.
CREATE TABLE IF NOT EXISTS egresos (
  id SERIAL PRIMARY KEY,
  alcance VARCHAR(10) NOT NULL CHECK (alcance IN ('conjunto', 'torre')),
  torre_id INTEGER REFERENCES torres(id) ON DELETE CASCADE,
  proveedor_id INTEGER NOT NULL REFERENCES proveedores(id),
  categoria VARCHAR(30) NOT NULL,
  concepto VARCHAR(200) NOT NULL,
  numero_documento VARCHAR(40),
  fecha DATE NOT NULL,
  valor NUMERIC(12, 2) NOT NULL CHECK (valor > 0),
  estado VARCHAR(10) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'pagado', 'anulado')),
  fecha_pago DATE,
  comprobante_url TEXT,
  motivo_anulacion TEXT,
  creado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  anulado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  anulado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT egresos_torre_check CHECK ((alcance = 'torre') = (torre_id IS NOT NULL)),
  CONSTRAINT egresos_anulacion_check CHECK ((estado = 'anulado') = (motivo_anulacion IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS egresos_fecha_idx ON egresos (fecha DESC, id DESC);
CREATE INDEX IF NOT EXISTS egresos_torre_idx ON egresos (torre_id, fecha DESC);
ALTER TABLE egresos ENABLE ROW LEVEL SECURITY;

ALTER TABLE finanzas_movimientos DROP CONSTRAINT IF EXISTS finanzas_movimientos_origen_check;
ALTER TABLE finanzas_movimientos ADD CONSTRAINT finanzas_movimientos_origen_check
  CHECK (origen IN ('manual', 'pago_alicuota', 'pago_multa', 'pago_torre', 'pago_cargo', 'egreso'));

-- 2. Presupuesto anual: un monto por anio, alcance (conjunto o torre) y categoria de egreso.
CREATE TABLE IF NOT EXISTS presupuestos (
  id SERIAL PRIMARY KEY,
  anio INTEGER NOT NULL CHECK (anio BETWEEN 2000 AND 2200),
  alcance VARCHAR(10) NOT NULL CHECK (alcance IN ('conjunto', 'torre')),
  torre_id INTEGER REFERENCES torres(id) ON DELETE CASCADE,
  categoria VARCHAR(30) NOT NULL,
  monto NUMERIC(12, 2) NOT NULL CHECK (monto >= 0),
  actualizado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT presupuestos_torre_check CHECK ((alcance = 'torre') = (torre_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS presupuestos_unico_idx ON presupuestos (anio, alcance, COALESCE(torre_id, 0), categoria);
ALTER TABLE presupuestos ENABLE ROW LEVEL SECURITY;

-- 3. Asambleas -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS asambleas (
  id SERIAL PRIMARY KEY,
  titulo VARCHAR(150) NOT NULL,
  tipo VARCHAR(15) NOT NULL CHECK (tipo IN ('ordinaria', 'extraordinaria')),
  fecha_hora TIMESTAMPTZ NOT NULL,
  lugar VARCHAR(150) NOT NULL,
  -- Puntos del orden del dia, en orden.
  orden_del_dia JSONB NOT NULL DEFAULT '[]'::jsonb,
  estado VARCHAR(12) NOT NULL DEFAULT 'convocada' CHECK (estado IN ('convocada', 'realizada', 'cancelada')),
  -- Resumen de lo resuelto (si se realizo) o motivo (si se cancelo).
  resultado TEXT,
  comunicado_id INTEGER REFERENCES comunicados(id) ON DELETE SET NULL,
  correos_enviados INTEGER NOT NULL DEFAULT 0,
  creado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS asambleas_fecha_idx ON asambleas (fecha_hora DESC);
ALTER TABLE asambleas ENABLE ROW LEVEL SECURITY;

-- 4. Mantenimientos programados ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mantenimientos (
  id SERIAL PRIMARY KEY,
  titulo VARCHAR(150) NOT NULL,
  descripcion TEXT,
  area VARCHAR(100),
  proveedor_id INTEGER REFERENCES proveedores(id) ON DELETE SET NULL,
  costo_estimado NUMERIC(12, 2) CHECK (costo_estimado IS NULL OR costo_estimado >= 0),
  frecuencia VARCHAR(12) NOT NULL CHECK (frecuencia IN ('unica', 'mensual', 'trimestral', 'semestral', 'anual')),
  proxima_fecha DATE NOT NULL,
  -- Cuantos dias antes de proxima_fecha se envia el recordatorio.
  dias_aviso INTEGER NOT NULL DEFAULT 7 CHECK (dias_aviso BETWEEN 0 AND 60),
  -- proxima_fecha para la que ya se envio el recordatorio (evita repetirlo).
  aviso_enviado_para DATE,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS mantenimientos_proxima_idx ON mantenimientos (activo, proxima_fecha);
ALTER TABLE mantenimientos ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS mantenimiento_ejecuciones (
  id SERIAL PRIMARY KEY,
  mantenimiento_id INTEGER NOT NULL REFERENCES mantenimientos(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  observaciones TEXT,
  costo NUMERIC(12, 2) CHECK (costo IS NULL OR costo >= 0),
  registrado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS mantenimiento_ejecuciones_idx ON mantenimiento_ejecuciones (mantenimiento_id, fecha DESC);
ALTER TABLE mantenimiento_ejecuciones ENABLE ROW LEVEL SECURITY;

-- 5. Archivo de documentos --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documentos (
  id SERIAL PRIMARY KEY,
  titulo VARCHAR(150) NOT NULL,
  categoria VARCHAR(15) NOT NULL CHECK (categoria IN ('reglamento', 'acta', 'contrato', 'otro')),
  descripcion VARCHAR(500),
  archivo_url TEXT NOT NULL,
  -- todos: cualquier usuario con sesion. gestion: solo administracion y tesoreria (p. ej. contratos).
  visibilidad VARCHAR(10) NOT NULL DEFAULT 'todos' CHECK (visibilidad IN ('todos', 'gestion')),
  subido_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS documentos_categoria_idx ON documentos (categoria, created_at DESC);
ALTER TABLE documentos ENABLE ROW LEVEL SECURITY;

-- 6. Bitacora de la guardia: registro de solo lectura una vez guardado (no se edita ni se borra).
CREATE TABLE IF NOT EXISTS novedades_guardia (
  id SERIAL PRIMARY KEY,
  tipo VARCHAR(15) NOT NULL CHECK (tipo IN ('ronda', 'incidente', 'mantenimiento', 'entrega_turno', 'otro')),
  descripcion TEXT NOT NULL,
  departamento_id INTEGER REFERENCES departamentos(id) ON DELETE SET NULL,
  fotos TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  registrado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS novedades_guardia_fecha_idx ON novedades_guardia (created_at DESC);
ALTER TABLE novedades_guardia ENABLE ROW LEVEL SECURITY;
