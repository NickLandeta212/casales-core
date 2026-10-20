const { pool } = require('../config/database');
const alicuotaModel = require('./alicuota.model');

// Deuda de cada departamento de las torres indicadas, con la misma regla del portal del condomino:
// se adeudan los meses del anio hasta mes_corte sin pago o con el pago rechazado, mas las multas y los
// cargos extraordinarios pendientes.
// Los meses con comprobante en revision no cuentan como deuda.
async function findByTorreIds({ torre_ids, anio, mes_corte }) {
  const result = await pool.query(
    `WITH meses AS (
       SELECT generate_series(1, $2::int) AS mes
     ),
     alicuotas AS (
       SELECT d.id AS departamento_id,
              COALESCE(array_agg(meses.mes ORDER BY meses.mes) FILTER (WHERE p.id IS NULL OR p.estado = 'rechazado'), '{}') AS meses_adeudados,
              COUNT(*) FILTER (WHERE p.estado = 'en_revision')::int AS meses_en_revision
       FROM departamentos d
       CROSS JOIN meses
       LEFT JOIN pagos_alicuotas p ON p.departamento_id = d.id AND p.anio = $1 AND p.mes = meses.mes
       WHERE d.torre_id = ANY($3::int[])
       GROUP BY d.id
     ),
     multas_pendientes AS (
       SELECT departamento_id, COUNT(*)::int AS cantidad, SUM(monto) AS total
       FROM multas
       WHERE estado = 'pendiente'
       GROUP BY departamento_id
     ),
     cargos_pendientes AS (
       SELECT departamento_id, COUNT(*)::int AS cantidad, SUM(valor) AS total
       FROM cargos
       WHERE estado = 'pendiente'
       GROUP BY departamento_id
     )
     SELECT d.id AS departamento_id, d.numero AS departamento_numero, d.torre_id, t.numero AS torre_numero,
            u.nombre AS titular,
            a.meses_adeudados, a.meses_en_revision,
            COALESCE(m.cantidad, 0) AS multas_pendientes,
            COALESCE(m.total, 0) AS multas_adeudadas,
            COALESCE(c.cantidad, 0) AS cargos_pendientes,
            COALESCE(c.total, 0) AS cargos_adeudados
     FROM departamentos d
     INNER JOIN torres t ON t.id = d.torre_id
     INNER JOIN alicuotas a ON a.departamento_id = d.id
     LEFT JOIN multas_pendientes m ON m.departamento_id = d.id
     LEFT JOIN cargos_pendientes c ON c.departamento_id = d.id
     LEFT JOIN usuarios u ON u.id = d.usuario_id
     ORDER BY t.numero ASC, d.numero ASC`,
    [anio, mes_corte, torre_ids]
  );

  const valores = new Map();

  for (const torreId of new Set(result.rows.map((row) => row.torre_id))) {
    valores.set(torreId, await alicuotaModel.getValorVigente(torreId, anio));
  }

  return result.rows.map((row) => {
    const alicuotasAdeudadas = row.meses_adeudados.length * valores.get(row.torre_id);
    const multasAdeudadas = Number(row.multas_adeudadas);
    const cargosAdeudados = Number(row.cargos_adeudados);

    return {
      ...row,
      valor_alicuota: valores.get(row.torre_id),
      alicuotas_adeudadas: alicuotasAdeudadas,
      multas_adeudadas: multasAdeudadas,
      cargos_adeudados: cargosAdeudados,
      total_adeudado: alicuotasAdeudadas + multasAdeudadas + cargosAdeudados,
    };
  });
}

module.exports = { findByTorreIds };
