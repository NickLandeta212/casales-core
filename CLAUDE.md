# casales-core (backend)

Node 20 + Express 5 + PostgreSQL (Supabase). Comprobantes en Supabase Storage, PDFs con pdfkit.

## Memoria compartida (leer antes de trabajar)
@docs/memoria/estado.md
@docs/memoria/decisiones.md
@docs/memoria/dominio.md

## Comandos
- `npm run dev`: servidor con recarga. El puerto sale de `PORT` en `.env` (revisa que coincida con `casales-ng/proxy.conf.json`).
- `npm run db:migrate`: aplica las migraciones nuevas de `migrations/` (registro en la tabla `schema_migrations`).
- `npm run test:smoke`: prueba rapida de la API.

## Convenciones
- Capas: `routes` -> `controllers` -> `models` (SQL con `pool.query`) y `services` para PDF, correo y storage.
- Cambios de base de datos solo con una migracion nueva numerada (`012_...sql`), nunca editando una ya aplicada. Tablas nuevas con `ENABLE ROW LEVEL SECURITY`.
- Si cambias `src/config/permisos.js`, actualiza tambien `casales-ng/src/app/auth/permisos.ts`.
- Las rutas que cambian datos pasan por `middlewares/auditTrail.js`; registra ahi los modulos y acciones nuevas.
- El tesorero solo ve sus torres (`req.user.torre_ids`); un recurso de otra torre responde 404.
- Respeta el fin de linea de cada archivo (algunos son CRLF).
