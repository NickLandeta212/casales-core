async function ensureUsuariosRoleConstraint(pool) {
  await pool.query(`
    ALTER TABLE usuarios
      ADD COLUMN IF NOT EXISTS page_permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS torre_ids INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
  `);

  await pool.query(`
    ALTER TABLE usuarios
      DROP CONSTRAINT IF EXISTS usuarios_role_check;
  `);

  await pool.query(`
    ALTER TABLE usuarios
      ADD CONSTRAINT usuarios_role_check
      CHECK ((role)::text = ANY ((ARRAY[
        'admin_general'::character varying,
        'admin_conjunto'::character varying,
        'tesorero'::character varying,
        'condomino'::character varying
      ])::text[]));
  `);
}

module.exports = ensureUsuariosRoleConstraint;

if (require.main === module) {
  require('dotenv').config({ override: true });

  const { pool } = require('../src/config/database');

  ensureUsuariosRoleConstraint(pool)
    .then(() => {
      console.log('Restriccion de rol de usuarios verificada correctamente');
    })
    .catch((error) => {
      console.error('Error al verificar la restriccion de rol de usuarios:', error.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
