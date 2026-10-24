-- Solicitudes con fotos de evidencia y enviadas tambien por el tesorero y la guardia.
-- Las del condomino siguen ligadas a su departamento; las del tesorero o la guardia no tienen departamento
-- y las atiende la administracion. Las fotos viven en el bucket privado 'comprobantes' (migracion 005).
ALTER TABLE solicitudes ALTER COLUMN departamento_id DROP NOT NULL;
ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS fotos TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
CREATE INDEX IF NOT EXISTS solicitudes_creado_por_idx ON solicitudes (creado_por, created_at DESC);
