const { pool } = require('../src/config/database');

function buildConfigForTotal(total) {
  if (total === 68) {
    return { ss: 4, pb: 8, d: 56 };
  }

  if (total === 64) {
    return { ss: 0, pb: 8, d: 56 };
  }

  if (total === 36) {
    return { ss: 0, pb: 4, d: 32 };
  }

  if (total === 32) {
    return { ss: 0, pb: 0, d: 32 };
  }

  return { ss: 0, pb: 0, d: total };
}

function buildCodes(torreNumero, config) {
  const codes = [];

  for (let i = 1; i <= config.ss; i += 1) {
    codes.push(`T${torreNumero}SS${i}`);
  }

  for (let i = 1; i <= config.pb; i += 1) {
    codes.push(`T${torreNumero}PB${i}`);
  }

  for (let i = 1; i <= config.d; i += 1) {
    codes.push(`T${torreNumero}D${i}`);
  }

  return codes;
}

async function run() {
  const torres = await pool.query(
    'SELECT id, numero, total_departamentos FROM torres ORDER BY numero ASC'
  );

  if (torres.rowCount === 0) {
    throw new Error('No hay torres cargadas. Ejecuta primero el seed de torres.');
  }

  let insertedTotal = 0;

  for (const torre of torres.rows) {
    const config = buildConfigForTotal(Number(torre.total_departamentos));
    const codes = buildCodes(Number(torre.numero), config);

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

  console.log(`Seed de departamentos completado. Nuevos insertados: ${insertedTotal}`);
  console.table(summary.rows);
}

run()
  .catch((error) => {
    console.error('Error al sembrar departamentos:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
