require('dotenv').config({ override: true });

const { pool } = require('../src/config/database');

async function ensureMultasTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS multas (
      id BIGSERIAL PRIMARY KEY,
      departamento_id INTEGER NOT NULL REFERENCES departamentos(id) ON DELETE CASCADE,
      persona_nombre TEXT NOT NULL,
      persona_apellidos TEXT NOT NULL,
      persona_cedula TEXT NOT NULL,
      motivo TEXT NOT NULL,
      descripcion TEXT NOT NULL,
      monto NUMERIC(12, 2) NOT NULL,
      aprobada BOOLEAN NOT NULL DEFAULT FALSE,
      fecha TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  console.log('Tabla multas verificada correctamente');
}

ensureMultasTable()
  .catch((error) => {
    console.error('Error al crear/verificar la tabla multas:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });