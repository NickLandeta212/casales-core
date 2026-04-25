const fs = require('fs');
const path = require('path');
const { pool } = require('../src/config/database');
const { runSeedDepartamentos } = require('./seed-departamentos');

async function run() {
  const schemaPath = path.join(__dirname, '../../database/schema.sql');
  const seedPath = path.join(__dirname, '../../database/seed.sql');

  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  const seedSql = fs.readFileSync(seedPath, 'utf8');

  // Drop all tables to ensure clean reset
  await pool.query(`
    DROP TABLE IF EXISTS reservas CASCADE;
    DROP TABLE IF EXISTS personas CASCADE;
    DROP TABLE IF EXISTS departamentos CASCADE;
    DROP TABLE IF EXISTS torres CASCADE;
    DROP TABLE IF EXISTS usuarios CASCADE;
  `);

  await pool.query(schemaSql);
  await pool.query(seedSql);
  const seeded = await runSeedDepartamentos();

  const summary = await pool.query(
    `SELECT
      (SELECT COUNT(*)::int FROM torres) AS torres,
      (SELECT COUNT(*)::int FROM departamentos) AS departamentos`
  );

  console.log('Base inicializada correctamente');
  console.log(summary.rows[0]);
  console.log(`Departamentos base sembrados: ${seeded.insertedTotal}`);
}

run()
  .catch((error) => {
    console.error('Error al inicializar base:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
