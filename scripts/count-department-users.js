require('dotenv').config({ override: true });
const { pool } = require('../src/config/database');

async function main() {
  try {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM departamentos) AS departamentos,
        (SELECT COUNT(*)::int FROM departamentos WHERE usuario_id IS NOT NULL) AS departamentos_asignados,
        (SELECT COUNT(*)::int FROM usuarios WHERE role = 'condomino') AS usuarios_departamento,
        (SELECT COUNT(*)::int FROM usuarios WHERE role = 'condomino' AND email ~ '^t[0-9]+d') AS usuarios_codigo
    `);

    console.log(JSON.stringify(result.rows[0], null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
