-- Destino de cada solicitud: 'conjunto' (areas comunales o todo el conjunto) la atiende la administracion;
-- 'torre' la atiende el tesorero de esa torre. Las existentes con departamento van a la torre del departamento.
ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS alcance VARCHAR(10);
ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS torre_id INTEGER REFERENCES torres(id) ON DELETE CASCADE;

UPDATE solicitudes s
SET alcance = CASE WHEN d.id IS NULL THEN 'conjunto' ELSE 'torre' END,
    torre_id = d.torre_id
FROM solicitudes s2
LEFT JOIN departamentos d ON d.id = s2.departamento_id
WHERE s.id = s2.id AND s.alcance IS NULL;

ALTER TABLE solicitudes ALTER COLUMN alcance SET NOT NULL;
ALTER TABLE solicitudes DROP CONSTRAINT IF EXISTS solicitudes_alcance_check;
ALTER TABLE solicitudes ADD CONSTRAINT solicitudes_alcance_check
  CHECK (alcance IN ('conjunto', 'torre') AND (alcance = 'torre') = (torre_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS solicitudes_destino_idx ON solicitudes (alcance, torre_id, created_at DESC);
