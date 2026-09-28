const fs = require('fs');
const { Pool, types } = require('pg');

// Las columnas DATE se devuelven como 'YYYY-MM-DD'. Por defecto pg las convierte a Date en la zona
// horaria del servidor, lo que puede correr la fecha un dia al serializarla a JSON.
types.setTypeParser(types.builtins.DATE, (value) => value);
require('dotenv').config({ override: true });

if (!process.env.DATABASE_URL) {
  throw new Error('Falta la variable DATABASE_URL en el archivo .env');
}

const rawUrl = new URL(process.env.DATABASE_URL);

// Evita que sslmode/sslrootcert de la URL sobrescriban el objeto ssl
rawUrl.searchParams.delete('sslmode');
rawUrl.searchParams.delete('sslcert');
rawUrl.searchParams.delete('sslkey');
rawUrl.searchParams.delete('sslrootcert');

// PGSSL=false desactiva SSL (solo para una BD local).
// PGSSL_CA=<ruta al certificado raiz del proveedor> activa la verificacion del certificado;
// sin CA se cifra la conexion pero no se valida el certificado del servidor.
function buildSslConfig() {
  if (String(process.env.PGSSL || 'true').toLowerCase() === 'false') {
    return false;
  }

  const caPath = String(process.env.PGSSL_CA || '').trim();

  if (caPath) {
    return { rejectUnauthorized: true, ca: fs.readFileSync(caPath, 'utf8') };
  }

  return { rejectUnauthorized: false };
}

const pool = new Pool({
  connectionString: rawUrl.toString(),
  ssl: buildSslConfig(),
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('connect', () => {
  console.log('[database] PostgreSQL conectado correctamente');
});

pool.on('error', (error) => {
  console.error('[database] Unexpected PostgreSQL error:', error.message);
});

module.exports = {
  pool,
};