-- Solicitudes y reclamos: los envia el condomino desde su cuenta y los atiende
-- el tesorero de su torre o la administracion.

CREATE TABLE IF NOT EXISTS solicitudes (
  id SERIAL PRIMARY KEY,
  departamento_id INTEGER NOT NULL REFERENCES departamentos(id) ON DELETE CASCADE,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('mantenimiento', 'reclamo', 'sugerencia')),
  asunto VARCHAR(150) NOT NULL,
  descripcion TEXT NOT NULL,
  estado VARCHAR(12) NOT NULL DEFAULT 'recibida' CHECK (estado IN ('recibida', 'en_proceso', 'resuelta')),
  respuesta TEXT,
  creado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  atendido_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS solicitudes_departamento_idx ON solicitudes (departamento_id, created_at DESC);

ALTER TABLE solicitudes ENABLE ROW LEVEL SECURITY;
