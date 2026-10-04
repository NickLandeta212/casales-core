-- Encuestas y votaciones: las crea la administracion y cada departamento vota una sola vez.

CREATE TABLE IF NOT EXISTS encuestas (
  id SERIAL PRIMARY KEY,
  titulo VARCHAR(150) NOT NULL,
  descripcion TEXT,
  estado VARCHAR(10) NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'cerrada')),
  creado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cerrada_at TIMESTAMPTZ
);
ALTER TABLE encuestas ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS encuesta_opciones (
  id SERIAL PRIMARY KEY,
  encuesta_id INTEGER NOT NULL REFERENCES encuestas(id) ON DELETE CASCADE,
  texto VARCHAR(150) NOT NULL,
  orden INTEGER NOT NULL,
  -- Permite exigir en encuesta_votos que la opcion pertenezca a la misma encuesta.
  UNIQUE (id, encuesta_id)
);
CREATE INDEX IF NOT EXISTS encuesta_opciones_encuesta_idx ON encuesta_opciones (encuesta_id, orden);
ALTER TABLE encuesta_opciones ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS encuesta_votos (
  id SERIAL PRIMARY KEY,
  encuesta_id INTEGER NOT NULL REFERENCES encuestas(id) ON DELETE CASCADE,
  opcion_id INTEGER NOT NULL,
  departamento_id INTEGER NOT NULL REFERENCES departamentos(id) ON DELETE CASCADE,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (opcion_id, encuesta_id) REFERENCES encuesta_opciones (id, encuesta_id) ON DELETE CASCADE,
  -- Un voto por departamento en cada encuesta.
  UNIQUE (encuesta_id, departamento_id)
);
ALTER TABLE encuesta_votos ENABLE ROW LEVEL SECURITY;
