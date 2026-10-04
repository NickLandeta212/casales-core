-- Comunicados de la administracion: los publican los administradores y los lee cualquier usuario con sesion.

CREATE TABLE IF NOT EXISTS comunicados (
  id SERIAL PRIMARY KEY,
  titulo VARCHAR(150) NOT NULL,
  contenido TEXT NOT NULL,
  fijado BOOLEAN NOT NULL DEFAULT FALSE,
  creado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS comunicados_orden_idx ON comunicados (fijado DESC, created_at DESC);

ALTER TABLE comunicados ENABLE ROW LEVEL SECURITY;
