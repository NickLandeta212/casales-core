-- Valores internos de la API que cambian en ejecucion y no pueden vivir en variables de entorno.
-- Hoy guarda la sesion del correo emisor de Outlook (Microsoft la renueva en cada uso).
-- Nunca se expone por la API de Casales.

CREATE TABLE IF NOT EXISTS ajustes_internos (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ajustes_internos ENABLE ROW LEVEL SECURITY;
