-- Los comprobantes de pago pasan del disco del servidor (uploads/) a Supabase Storage.
-- El bucket es privado: solo la API de Casales (clave secreta) puede leer y escribir,
-- y entrega enlaces temporales a quien tiene permiso de ver cada comprobante.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('comprobantes', 'comprobantes', FALSE, 4194304, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
