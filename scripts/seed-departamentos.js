const { pool } = require('../src/config/database');

function buildCodes(torreNumero) {
  const codes = [];
  const hasSub = torreNumero <= 4 || torreNumero === 8;
  const maxPb = torreNumero >= 8 ? 4 : 8;
  const maxDepPorPiso = torreNumero >= 8 ? 4 : 8;

  if (hasSub) {
    const subNumeros = ['101', '102', '201', '202'];
    for (const numero of subNumeros) {
      codes.push(`T${torreNumero}SS${numero}`);
    }
  }

  for (let n = 1; n <= maxPb; n += 1) {
    codes.push(`T${torreNumero}PB${n.toString().padStart(3, '0')}`);
  }

  for (let piso = 1; piso <= 7; piso += 1) {
    for (let n = 1; n <= maxDepPorPiso; n += 1) {
      const numero = `${piso}${n.toString().padStart(2, '0')}`;
      codes.push(`T${torreNumero}D${numero}`);
    }
  }

  return codes;
}

async function runSeedDepartamentos() {
  const torres = await pool.query(
    'SELECT id, numero, total_departamentos FROM torres ORDER BY numero ASC'
  );

  if (torres.rowCount === 0) {
    throw new Error('No hay torres cargadas. Ejecuta primero el seed de torres.');
  }

  let insertedTotal = 0;

  for (const torre of torres.rows) {
    const codes = buildCodes(Number(torre.numero));

    for (const code of codes) {
      const result = await pool.query(
        `INSERT INTO departamentos (torre_id, numero, usuario_id)
         VALUES ($1, $2, NULL)
         ON CONFLICT (torre_id, numero) DO NOTHING`,
        [torre.id, code]
      );

      insertedTotal += result.rowCount;
    }
  }

  const summary = await pool.query(
    `SELECT t.numero AS torre,
            COUNT(d.id)::int AS total
     FROM torres t
     LEFT JOIN departamentos d ON d.torre_id = t.id
     GROUP BY t.numero
     ORDER BY t.numero ASC`
  );

  return {
    insertedTotal,
    summary: summary.rows,
  };
}

module.exports = { runSeedDepartamentos };

if (require.main === module) {
  runSeedDepartamentos()
    .then((result) => {
      console.log(`Seed de departamentos completado. Nuevos insertados: ${result.insertedTotal}`);
      console.table(result.summary);
    })
    .catch((error) => {
      console.error('Error al sembrar departamentos:', error.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
