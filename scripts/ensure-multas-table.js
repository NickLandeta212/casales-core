require('dotenv').config({ override: true });

const { pool } = require('../src/config/database');
const multaModel = require('../src/models/multa.model');

async function ensureMultasTable() {
  await multaModel.ensureTable();

  console.log('Tablas de multas y pagos verificadas correctamente');
}

if (require.main === module) {
  ensureMultasTable()
    .catch((error) => {
      console.error('Error al crear/verificar la tabla multas:', error.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}

module.exports = ensureMultasTable;
