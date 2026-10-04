-- Porteria: visitas que el residente anuncia desde su cuenta y paquetes que recibe la guardia.

CREATE TABLE IF NOT EXISTS visitas_anunciadas (
  id SERIAL PRIMARY KEY,
  departamento_id INTEGER NOT NULL REFERENCES departamentos(id) ON DELETE CASCADE,
  visitante VARCHAR(120) NOT NULL,
  documento VARCHAR(40),
  placa_vehiculo VARCHAR(20),
  fecha DATE NOT NULL,
  nota VARCHAR(300),
  estado VARCHAR(12) NOT NULL DEFAULT 'anunciada' CHECK (estado IN ('anunciada', 'ingreso', 'cancelada')),
  creado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  -- Registro de acceso que se crea cuando la guardia confirma el ingreso.
  acceso_id INTEGER REFERENCES accesos_guardia(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS visitas_anunciadas_fecha_idx ON visitas_anunciadas (fecha, estado);
CREATE INDEX IF NOT EXISTS visitas_anunciadas_departamento_idx ON visitas_anunciadas (departamento_id, fecha DESC);
ALTER TABLE visitas_anunciadas ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS paquetes (
  id SERIAL PRIMARY KEY,
  departamento_id INTEGER NOT NULL REFERENCES departamentos(id) ON DELETE CASCADE,
  descripcion VARCHAR(200) NOT NULL,
  estado VARCHAR(12) NOT NULL DEFAULT 'en_porteria' CHECK (estado IN ('en_porteria', 'entregado')),
  recibido_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  entregado_a VARCHAR(120),
  entregado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  entregado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS paquetes_departamento_idx ON paquetes (departamento_id, created_at DESC);
CREATE INDEX IF NOT EXISTS paquetes_estado_idx ON paquetes (estado, created_at DESC);
ALTER TABLE paquetes ENABLE ROW LEVEL SECURITY;
