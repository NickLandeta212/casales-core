const { pool } = require('../src/config/database');

async function run() {
  const ordered = await pool.query(
    `SELECT t.numero AS torre,
            d.numero,
            ROW_NUMBER() OVER (
              ORDER BY t.numero ASC,
                       CASE
                         WHEN d.numero ~ '^T[0-9]+SS' THEN 1
                         WHEN d.numero ~ '^T[0-9]+PB' THEN 2
                         WHEN d.numero ~ '^T[0-9]+D' THEN 3
                         ELSE 99
                       END ASC,
                       d.numero ASC,
                       d.id ASC
            )::int AS n
     FROM departamentos d
     INNER JOIN torres t ON t.id = d.torre_id`
  );

  const total = ordered.rowCount;
  const minN = total > 0 ? ordered.rows[0].n : 0;
  const maxN = total > 0 ? ordered.rows[total - 1].n : 0;

  let gaps = 0;
  for (let i = 0; i < total; i += 1) {
    if (ordered.rows[i].n !== i + 1) {
      gaps += 1;
      break;
    }
  }

  console.log('Secuencia N#:');
  console.log({ min: minN, max: maxN, total, continua: gaps === 0 });

  const sample = await pool.query(
    `SELECT t.numero AS torre,
            d.numero
     FROM departamentos d
     INNER JOIN torres t ON t.id = d.torre_id
     ORDER BY t.numero ASC,
              CASE
                WHEN d.numero ~ '^T[0-9]+SS' THEN 1
                WHEN d.numero ~ '^T[0-9]+PB' THEN 2
                WHEN d.numero ~ '^T[0-9]+D' THEN 3
                ELSE 99
              END ASC,
              d.numero ASC,
              d.id ASC
     LIMIT 20`
  );

  console.log('Primeros 20 en orden:');
  console.table(sample.rows);
}

run()
  .catch((error) => {
    console.error('Error validacion:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
