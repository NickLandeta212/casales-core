-- Esquema base: refleja la base de datos en produccion a septiembre de 2026.
-- Usa IF NOT EXISTS, por lo que no modifica una base ya existente.

CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  email VARCHAR(120) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(30) NOT NULL
    CONSTRAINT usuarios_role_check CHECK (role IN ('admin_general', 'admin_conjunto', 'tesorero', 'condomino')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  page_permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  torre_ids INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[]
);

CREATE TABLE IF NOT EXISTS torres (
  id SERIAL PRIMARY KEY,
  numero INTEGER NOT NULL UNIQUE,
  total_departamentos INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO torres (numero, total_departamentos) VALUES
  (1, 68), (2, 68), (3, 68), (4, 68), (5, 64),
  (6, 64), (7, 64), (8, 36), (9, 32), (10, 32)
ON CONFLICT (numero) DO NOTHING;

CREATE TABLE IF NOT EXISTS departamentos (
  id SERIAL PRIMARY KEY,
  torre_id INTEGER NOT NULL REFERENCES torres(id) ON DELETE CASCADE,
  numero VARCHAR(30) NOT NULL,
  usuario_id INTEGER UNIQUE REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (torre_id, numero)
);

CREATE TABLE IF NOT EXISTS personas (
  id SERIAL PRIMARY KEY,
  departamento_id INTEGER NOT NULL REFERENCES departamentos(id) ON DELETE CASCADE,
  nombres VARCHAR(120) NOT NULL,
  apellidos VARCHAR(120) NOT NULL,
  documento VARCHAR(50) NOT NULL,
  telefono VARCHAR(30),
  tipo_ocupacion VARCHAR(20) NOT NULL DEFAULT 'dueno'
    CONSTRAINT personas_tipo_ocupacion_check CHECK (tipo_ocupacion IN ('dueno', 'arrendatario')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reservas (
  id SERIAL PRIMARY KEY,
  departamento_id INTEGER NOT NULL REFERENCES departamentos(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'disponible'
    CONSTRAINT reservas_estado_check CHECK (estado IN ('disponible', 'en_proceso', 'reservado')),
  observaciones TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT reservas_fecha_key UNIQUE (fecha)
);

CREATE TABLE IF NOT EXISTS motivos_multa (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE
);

INSERT INTO motivos_multa (nombre) VALUES ('Areas comunes'), ('Mascotas'), ('Parqueaderos')
ON CONFLICT (nombre) DO NOTHING;

CREATE TABLE IF NOT EXISTS multas (
  id BIGSERIAL PRIMARY KEY,
  departamento_id INTEGER NOT NULL REFERENCES departamentos(id) ON DELETE CASCADE,
  motivo_id INTEGER NOT NULL REFERENCES motivos_multa(id),
  persona_nombre TEXT NOT NULL,
  persona_apellidos TEXT NOT NULL,
  persona_cedula TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  monto NUMERIC(12, 2) NOT NULL,
  aprobada BOOLEAN NOT NULL DEFAULT FALSE,
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pagos_multas (
  id BIGSERIAL PRIMARY KEY,
  departamento_id INTEGER NOT NULL REFERENCES departamentos(id) ON DELETE CASCADE,
  total NUMERIC(12, 2) NOT NULL,
  comprobante_url TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'en_proceso',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  email_destinatario TEXT
);

CREATE TABLE IF NOT EXISTS pagos_multas_detalle (
  id BIGSERIAL PRIMARY KEY,
  pago_multa_id BIGINT NOT NULL REFERENCES pagos_multas(id) ON DELETE CASCADE,
  multa_id BIGINT REFERENCES multas(id) ON DELETE SET NULL,
  monto NUMERIC(12, 2) NOT NULL,
  descripcion TEXT,
  persona_nombre TEXT,
  persona_apellidos TEXT,
  motivo_nombre TEXT,
  UNIQUE (pago_multa_id, multa_id)
);

CREATE TABLE IF NOT EXISTS pagos_alicuotas (
  id SERIAL PRIMARY KEY,
  torre_id INTEGER NOT NULL REFERENCES torres(id) ON DELETE CASCADE,
  departamento_id INTEGER NOT NULL REFERENCES departamentos(id) ON DELETE CASCADE,
  anio INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  descripcion TEXT NOT NULL,
  valor NUMERIC(12, 2) NOT NULL DEFAULT 45,
  comprobante_url TEXT,
  comprobante_nombre TEXT,
  estado VARCHAR(20) NOT NULL DEFAULT 'en_revision',
  fecha_pago TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  aprobado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  aprobado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  email_destinatario TEXT,
  UNIQUE (departamento_id, anio, mes)
);

CREATE TABLE IF NOT EXISTS pagos_alicuotas_torres (
  id SERIAL PRIMARY KEY,
  torre_id INTEGER NOT NULL REFERENCES torres(id) ON DELETE CASCADE,
  anio INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  descripcion TEXT NOT NULL,
  valor NUMERIC(12, 2) NOT NULL DEFAULT 0,
  comprobante_url TEXT,
  comprobante_nombre TEXT,
  estado VARCHAR(20) NOT NULL DEFAULT 'en_revision',
  fecha_pago TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  aprobado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  aprobado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (torre_id, anio, mes)
);

-- Supabase expone el esquema public por su API REST con la clave anon.
-- RLS sin politicas bloquea ese acceso; la API de Casales se conecta como postgres (bypassrls).
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE torres ENABLE ROW LEVEL SECURITY;
ALTER TABLE departamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservas ENABLE ROW LEVEL SECURITY;
ALTER TABLE motivos_multa ENABLE ROW LEVEL SECURITY;
ALTER TABLE multas ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos_multas ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos_multas_detalle ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos_alicuotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos_alicuotas_torres ENABLE ROW LEVEL SECURITY;
