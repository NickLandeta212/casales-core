const { pool } = require('../src/config/database');

async function run() {
  const totals = await pool.query(
    `SELECT t.numero AS torre,
            COUNT(d.id)::int AS total,
            COUNT(*) FILTER (WHERE d.numero ~ '^T[0-9]+SS')::int AS ss,
            COUNT(*) FILTER (WHERE d.numero ~ '^T[0-9]+PB')::int AS pb,
            COUNT(*) FILTER (WHERE d.numero ~ '^T[0-9]+D')::int AS d
     FROM torres t
     LEFT JOIN departamentos d ON d.torre_id = t.id
     GROUP BY t.numero
     ORDER BY t.numero`
  );

  const totalAll = await pool.query('SELECT COUNT(*)::int AS total FROM departamentos');

  const tower8 = await pool.query(
    `SELECT d.numero AS numero
     FROM departamentos d
     INNER JOIN torres t ON t.id = d.torre_id
     WHERE t.numero = 8
      ORDER BY d.numero`
  );

  console.log('Totales por torre:');
  console.table(totals.rows);
  console.log('Total departamentos global:', totalAll.rows[0].total);
  console.log('Torre 8 total:', tower8.rowCount);
  console.log('Torre 8 codigos:', tower8.rows.map((row) => row.numero));
}

run()
  .catch((error) => {
    console.error('Error inspeccion:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
