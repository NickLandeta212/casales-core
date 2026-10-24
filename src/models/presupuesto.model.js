const { pool, withTransaction } = require('../config/database');

// Presupuesto anual por categoria de egreso, para el conjunto o para una torre.

async function findMontos({ anio, alcance, torre_id }) {
  const result = await pool.query(
    `SELECT categoria, monto
     FROM presupuestos
     WHERE anio = $1 AND alcance = $2 AND torre_id IS NOT DISTINCT FROM $3`,
    [anio, alcance, torre_id]
  );

  return result.rows;
}

// Guarda todos los montos del anio de una vez. Un monto en cero elimina la categoria del presupuesto.
async function saveMontos({ anio, alcance, torre_id, montos, user_id }) {
  await withTransaction(async (client) => {
    for (const { categoria, monto } of montos) {
      await client.query(
        `DELETE FROM presupuestos
         WHERE anio = $1 AND alcance = $2 AND torre_id IS NOT DISTINCT FROM $3 AND categoria = $4`,
        [anio, alcance, torre_id, categoria]
      );

      if (monto > 0) {
        await client.query(
          `INSERT INTO presupuestos (anio, alcance, torre_id, categoria, monto, actualizado_por)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [anio, alcance, torre_id, categoria, monto, user_id]
        );
      }
    }
  });
}

module.exports = { findMontos, saveMontos };
