# API Conjunto Habitacional

Backend en Node.js con Express y PostgreSQL para administrar torres, departamentos, personas, reservas y autenticacion por roles.

## Estructura

- `src/config`: conexion a PostgreSQL
- `src/controllers`: reglas de cada recurso
- `src/models`: acceso a datos
- `src/routes`: endpoints REST
- `src/middlewares`: autenticacion y manejo de errores
- `src/utils`: helpers comunes
- `../database`: scripts SQL de schema y seed

## Instalacion

1. Copia `.env.example` a `.env`
2. Ajusta credenciales de PostgreSQL (`PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`) o `DATABASE_URL`
3. Define un `JWT_SECRET` fuerte
4. Si el QR publico se usara fuera de red local, define `PUBLIC_APP_URL` con tu dominio publico (ejemplo: `https://app.tudominio.com`). Si no lo defines, la app igual arranca, pero el QR dependera de la URL que devuelva el backend.
5. Ajusta `CORS_ORIGIN` con tus origenes permitidos (separados por comas)
6. Ejecuta el schema en PostgreSQL
7. Inicia el servidor con `npm start`

Si vas a enviar facturas por correo, define tambien la configuracion SMTP:

```bash
SMTP_SERVICE=gmail
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=tu_correo@gmail.com
SMTP_PASS=tu_contrasena_de_aplicacion
SMTP_FROM="Casales San Pedro <tu_correo@gmail.com>"
```

Para Gmail, `SMTP_PASS` debe ser una contrasena de aplicacion. La clave normal de la cuenta no sirve para SMTP. Antes de aprobar pagos reales, prueba el envio con:

Tambien puedes usar `SMTP_SERVICE=outlook`, `hotmail`, `yahoo`, `zoho` o dejar un proveedor propio usando `SMTP_HOST`. El destinatario de la factura puede ser de cualquier dominio valido; SMTP configura solo el correo emisor.

```bash
npm run mail:test -- correo@destino.com
```

Si esa prueba falla, la aprobacion de pagos tambien fallara porque el envio de factura es obligatorio.

## Despliegue online (recomendado)

Este backend es el punto central del producto en modo web. Para sincronizar datos entre dispositivos, desplegalo en un servidor unico con una base PostgreSQL compartida y apunta el frontend web a esa URL.

En el despliegue web, solo se expone el puerto HTTP/HTTPS de la aplicacion. La conexion a PostgreSQL debe quedar privada por variables de entorno y no como un puerto publico del servidor.

Recomendacion practica: usa una sola URL publica para la app y mantiene PostgreSQL completamente fuera de acceso directo desde internet.

Si vas a usar Supabase, crea el proyecto, toma la cadena de conexion de Postgres y configúrala como `DATABASE_URL`. Supabase exige SSL, asi que deja `PGSSL=true` o agrega `sslmode=require` en la URL.

Ejemplo:

```bash
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.YOUR-PROJECT-REF.supabase.co:5432/postgres?sslmode=require
PGSSL=true
JWT_SECRET=una_clave_larga_y_segura
PUBLIC_APP_URL=https://app.tu-dominio.com
```

Variables recomendadas para produccion:

- `DATABASE_URL` o `PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD`/`PGDATABASE`
- `JWT_SECRET`
- `CORS_ORIGIN` con la URL del frontend web
- `PUBLIC_APP_URL` con la URL publica del frontend web usado por los QR

Para cargar las torres y los departamentos base, ejecuta tambien `../database/seed.sql`.

Tambien puedes inicializar todo con un comando:

- `npm run db:init`

Para pruebas end-to-end:

- `npm run test:smoke`

## Seguridad aplicada

- JWT obligatorio en rutas protegidas.
- Cabeceras de seguridad con `helmet`.
- Rate limit en `/auth` para reducir fuerza bruta.
- Validaciones de negocio:
  - Maximo 10 personas por departamento (crear y actualizar).
  - No reservas con formato de fecha invalido.
  - No crear/actualizar departamento fuera de la capacidad de su torre.

## Tablas base

El archivo `../database/schema.sql` crea:

- `usuarios`
- `torres`
- `departamentos`
- `personas`
- `reservas`

## Ejemplos de endpoints

### Auth

`POST /auth/login`

```json
{
  "email": "admin@conjunto.com",
  "password": "Secret123!"
}
```

### Torres

`GET /torres`

`POST /torres`

```json
{
  "numero": 11,
  "total_departamentos": 48
}
```

### Departamentos

`GET /departamentos`

`POST /departamentos`

```json
{
  "torre_id": 1,
  "numero": 101,
  "usuario_id": 5,
  "tipo_ocupacion": "dueno"
}
```

### Personas

`GET /personas`

`POST /personas`

```json
{
  "departamento_id": 1,
  "nombres": "Ana",
  "apellidos": "Perez",
  "documento": "1723456789",
  "telefono": "0999999999"
}
```

La regla de negocio limita a 10 personas por departamento.

### Reservas

`GET /reservas`

`POST /reservas`

```json
{
  "departamento_id": 1,
  "fecha": "2026-05-10",
  "estado": "reservado",
  "observaciones": "Cumpleanos familiar"
}
```

La fecha se maneja como unica para evitar reservas duplicadas.

### Facturas

`POST /api/v1/facturas/enviar-correo`

```json
{
  "email_destinatario": "cliente@correo.com",
  "asunto": "Factura de alicuota Enero 2026",
  "mensaje": "Adjuntamos su factura",
  "factura": {
    "numero": "FAC-2026-001",
    "cliente": "Maria Perez",
    "fecha": "2026-05-28"
  },
  "items": [
    {
      "descripcion": "Alicuota mensual",
      "cantidad": 1,
      "precio": 45.5
    }
  ],
  "total": 45.5,
  "pdf_base64": "JVBERi0xLjQK...",
  "pdf_filename": "factura-2026-001.pdf"
}
```

El endpoint acepta un PDF en base64 o adjuntos adicionales en `attachments`.

## Datos de prueba recomendados

Ejemplo para crear un usuario administrador en PostgreSQL:

```sql
INSERT INTO usuarios (nombre, email, password_hash, role)
VALUES ('Admin General', 'admin@conjunto.com', '$2a$10$replace_with_a_real_bcrypt_hash', 'admin_general');
```

## Pruebas con Postman

Archivos listos para importar:

- `postman/conjunto-api.postman_collection.json`
- `postman/conjunto-api.postman_environment.json`

Pasos recomendados:

1. Inicia la API con `npm start`.
2. Importa la coleccion y el environment en Postman.
3. Selecciona el environment `Conjunto API Local`.
4. Ejecuta `Auth > Login` para guardar automaticamente `token`.
5. Ejecuta el resto de endpoints (ya vienen parametrizados con `{{baseUrl}}` y `{{token}}`).
