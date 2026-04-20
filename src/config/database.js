const { Pool } = require('pg');
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

const pool = new Pool({
  connectionString: rawUrl.toString(),
  ssl: {
    rejectUnauthorized: false,
  },
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

async function testConnection() {
  const client = await pool.connect();

  try {
    const result = await client.query('SELECT NOW() AS server_time');
    console.log('[database] Test OK:', result.rows[0]);
    return result.rows[0];
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  testConnection,
};