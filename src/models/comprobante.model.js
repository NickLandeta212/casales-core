const { pool } = require('../config/database');

// Registros que usan un comprobante, con la torre y el usuario del departamento al que pertenecen.
// Sirve para decidir quien puede verlo. comprobante_url es el valor guardado (/uploads/comprobantes/<archivo>).
async function findOrigenes(comprobante_url) {
  const result = await pool.query(
    `SELECT 'pago_alicuota' AS tipo, p.torre_id, d.usuario_id
     FROM pagos_alicuotas p
     INNER JOIN departamentos d ON d.id = p.departamento_id
     WHERE p.comprobante_url = $1
     UNION ALL
     SELECT 'pago_multa', d.torre_id, d.usuario_id
     FROM pagos_multas p
     INNER JOIN departamentos d ON d.id = p.departamento_id
     WHERE p.comprobante_url = $1
     UNION ALL
     SELECT 'pago_torre', p.torre_id, NULL
     FROM pagos_alicuotas_torres p
     WHERE p.comprobante_url = $1
     UNION ALL
     SELECT 'reserva', d.torre_id, d.usuario_id
     FROM reservas r
     INNER JOIN departamentos d ON d.id = r.departamento_id
     WHERE r.observaciones LIKE '%Comprobante: ' || $1 || '%'`,
    [comprobante_url]
  );

  return result.rows;
}

module.exports = { findOrigenes };
