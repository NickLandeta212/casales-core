const { pool } = require('../config/database');

// Pagos aprobados de departamentos (alicuotas, multas y cargos) con su fecha de aprobacion.
const PAGOS_APROBADOS = `
  SELECT p.torre_id, p.valor AS monto, p.aprobado_at AS fecha
  FROM pagos_alicuotas p
  WHERE p.estado = 'aprobado'
  UNION ALL
  SELECT d.torre_id, p.total, p.revisado_at
  FROM pagos_multas p
  INNER JOIN departamentos d ON d.id = p.departamento_id
  WHERE p.estado = 'aprobado'
  UNION ALL
  SELECT d.torre_id, p.total, p.revisado_at
  FROM pagos_cargos p
  INNER JOIN departamentos d ON d.id = p.departamento_id
  WHERE p.estado = 'aprobado'`;

async function recaudacion(torre_ids) {
  const result = await pool.query(
    `WITH pagos AS (${PAGOS_APROBADOS})
     SELECT COALESCE(SUM(monto) FILTER (WHERE fecha >= NOW() - INTERVAL '7 days'), 0) AS semana,
            COALESCE(SUM(monto) FILTER (WHERE fecha >= DATE_TRUNC('month', NOW())), 0) AS mes
     FROM pagos
     WHERE torre_id = ANY($1::int[])`,
    [torre_ids]
  );

  return { semana: Number(result.rows[0].semana), mes: Number(result.rows[0].mes) };
}

// Recaudacion de los ultimos 6 meses, incluido el actual (meses sin pagos en cero).
async function recaudacionMensual(torre_ids) {
  const result = await pool.query(
    `WITH pagos AS (${PAGOS_APROBADOS}),
     meses AS (
       SELECT generate_series(DATE_TRUNC('month', NOW()) - INTERVAL '5 months', DATE_TRUNC('month', NOW()), INTERVAL '1 month') AS mes
     )
     SELECT EXTRACT(YEAR FROM meses.mes)::int AS anio,
            EXTRACT(MONTH FROM meses.mes)::int AS mes,
            COALESCE(SUM(pagos.monto), 0) AS total
     FROM meses
     LEFT JOIN pagos ON DATE_TRUNC('month', pagos.fecha) = meses.mes AND pagos.torre_id = ANY($1::int[])
     GROUP BY meses.mes
     ORDER BY meses.mes ASC`,
    [torre_ids]
  );

  return result.rows.map((row) => ({ anio: row.anio, mes: row.mes, total: Number(row.total) }));
}

async function porRevisar(torre_ids, { incluirTorres }) {
  const result = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM pagos_alicuotas WHERE estado = 'en_revision' AND torre_id = ANY($1::int[]))::int AS alicuotas,
       (SELECT COUNT(*) FROM pagos_multas p INNER JOIN departamentos d ON d.id = p.departamento_id
         WHERE p.estado = 'en_proceso' AND d.torre_id = ANY($1::int[]))::int AS multas,
       (SELECT COUNT(*) FROM pagos_cargos p INNER JOIN departamentos d ON d.id = p.departamento_id
         WHERE p.estado = 'en_proceso' AND d.torre_id = ANY($1::int[]))::int AS cargos,
       CASE WHEN $2 THEN (SELECT COUNT(*) FROM pagos_alicuotas_torres WHERE estado = 'en_revision')::int ELSE 0 END AS torres`,
    [torre_ids, incluirTorres]
  );

  const row = result.rows[0];
  return { ...row, total: row.alicuotas + row.multas + row.cargos + row.torres };
}

module.exports = { recaudacion, recaudacionMensual, porRevisar };
