const { pool } = require('../src/config/database');

function parseArgs(argv) {
  const args = {};

  for (const rawArg of argv) {
    if (!rawArg.startsWith('--')) {
      continue;
    }

    const [key, value] = rawArg.slice(2).split('=');
    args[key] = value === undefined ? 'true' : value;
  }

  return args;
}

function parsePositiveInt(value, label) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} debe ser un entero positivo`);
  }

  return parsed;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.from || !args.to) {
    throw new Error('Uso: --from=<torreOrigen> --to=<t1,t2,...> [--include-ss]');
  }

  const sourceNumero = parsePositiveInt(args.from, 'from');
  const targetNumeros = String(args.to)
    .split(',')
    .map((part) => parsePositiveInt(part.trim(), 'to'));

  if (targetNumeros.length === 0) {
    throw new Error('Debes indicar al menos una torre destino en --to');
  }

  if (targetNumeros.includes(sourceNumero)) {
    throw new Error('La torre origen no puede estar en --to');
  }

  const includeSs = String(args['include-ss'] || 'false').toLowerCase() === 'true';
  const towersToLoad = [sourceNumero, ...targetNumeros];

  const torresResult = await pool.query(
    'SELECT id, numero FROM torres WHERE numero = ANY($1::int[]) ORDER BY numero ASC',
    [towersToLoad]
  );

  const torreByNumero = new Map(torresResult.rows.map((row) => [Number(row.numero), Number(row.id)]));
  const sourceTorreId = torreByNumero.get(sourceNumero);

  if (!sourceTorreId) {
    throw new Error(`No existe la torre ${sourceNumero} en la base de datos`);
  }

  const sourceRows = await pool.query(
    `SELECT numero
     FROM departamentos
     WHERE torre_id = $1
       AND ($2::boolean OR numero !~ ('^T' || $3::text || 'SS'))
     ORDER BY id ASC`,
    [sourceTorreId, includeSs, sourceNumero]
  );

  if (sourceRows.rowCount === 0) {
    throw new Error(`La torre ${sourceNumero} no tiene departamentos para replicar`);
  }

  for (const targetNumero of targetNumeros) {
    const targetTorreId = torreByNumero.get(targetNumero);

    if (!targetTorreId) {
      continue;
    }

    for (const row of sourceRows.rows) {
      const nextNumero = String(row.numero).replace(
        new RegExp(`^T${sourceNumero}`),
        `T${targetNumero}`
      );

      await pool.query(
        `INSERT INTO departamentos (torre_id, numero, usuario_id)
         VALUES ($1, $2, NULL)
         ON CONFLICT (torre_id, numero) DO NOTHING`,
        [targetTorreId, nextNumero]
      );
    }
  }

  const totals = await pool.query(
    `SELECT t.numero AS torre,
            COUNT(d.id)::int AS total_departamentos,
            COUNT(*) FILTER (WHERE d.numero ~ '^T[0-9]+SS')::int AS total_ss
     FROM torres t
     LEFT JOIN departamentos d ON d.torre_id = t.id
     WHERE t.numero = ANY($1::int[])
     GROUP BY t.numero
     ORDER BY t.numero`,
    [towersToLoad]
  );

  console.log(`Replicacion completada desde torre ${sourceNumero} hacia [${targetNumeros.join(', ')}].`);
  console.table(totals.rows);
}

run()
  .catch((error) => {
    console.error('Error al replicar departamentos:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
