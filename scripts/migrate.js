// Aplica en orden los archivos de migrations/ que aun no se ejecutaron.
// Cada migracion corre en su propia transaccion y queda registrada en schema_migrations.
const fs = require('fs');
const path = require('path');

const migrationsDir = path.resolve(__dirname, '../migrations');

function listMigrationFiles() {
  return fs.readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort();
}

async function ensureMigrationsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // En Supabase, bloquea el acceso a esta tabla desde la API publica (clave anon).
  await pool.query('ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY');
}

// Solo lectura: la usa el servidor al arrancar para verificar que la base esta al dia.
async function getPendingMigrations(pool) {
  const exists = await pool.query("SELECT to_regclass('public.schema_migrations') AS tabla");
  const appliedNames = new Set();

  if (exists.rows[0].tabla) {
    const applied = await pool.query('SELECT name FROM schema_migrations');
    applied.rows.forEach((row) => appliedNames.add(row.name));
  }

  return listMigrationFiles().filter((file) => !appliedNames.has(file));
}

async function runMigrations(pool) {
  await ensureMigrationsTable(pool);
  const pending = await getPendingMigrations(pool);

  for (const file of pending) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`Migracion aplicada: ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Fallo la migracion ${file}: ${error.message}`);
    } finally {
      client.release();
    }
  }

  return pending;
}

module.exports = { getPendingMigrations, runMigrations };

if (require.main === module) {
  require('dotenv').config({ override: true });
  const { pool } = require('../src/config/database');

  runMigrations(pool)
    .then((applied) => {
      console.log(applied.length > 0 ? `${applied.length} migracion(es) aplicada(s).` : 'La base ya esta al dia.');
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
