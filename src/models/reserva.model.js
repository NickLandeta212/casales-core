const { pool } = require('../config/database');

const RESERVA_SELECT = `
  SELECT r.*, d.numero AS departamento_numero, t.numero AS torre_numero
  FROM reservas r
  INNER JOIN departamentos d ON d.id = r.departamento_id
  INNER JOIN torres t ON t.id = d.torre_id`;

async function findAll() {
  const result = await pool.query(`${RESERVA_SELECT} ORDER BY r.fecha DESC, r.created_at DESC`);
  return result.rows;
}

async function findAllByUsuarioId(usuario_id) {
  const result = await pool.query(
    `${RESERVA_SELECT} WHERE d.usuario_id = $1 ORDER BY r.fecha DESC, r.created_at DESC`,
    [usuario_id]
  );
  return result.rows;
}

async function findAllByTorreIds(torre_ids) {
  if (!Array.isArray(torre_ids) || torre_ids.length === 0) {
    return [];
  }

  const result = await pool.query(
    `${RESERVA_SELECT} WHERE d.torre_id = ANY($1::int[]) ORDER BY r.fecha DESC, r.created_at DESC`,
    [torre_ids]
  );
  return result.rows;
}

// Solo fechas, para el calendario publico: una fecha esta ocupada si tiene una reserva activa.
async function findFechasOcupadas() {
  const result = await pool.query(
    `SELECT DISTINCT TO_CHAR(fecha, 'YYYY-MM-DD') AS fecha
     FROM reservas
     WHERE fecha >= CURRENT_DATE
       AND estado IN ('en_proceso', 'reservado')
     ORDER BY fecha ASC`
  );

  return result.rows.map((row) => row.fecha);
}

async function create({ departamento_id, fecha, observaciones }) {
  const result = await pool.query(
    `INSERT INTO reservas (departamento_id, fecha, estado, observaciones)
     VALUES ($1, $2, 'en_proceso', $3)
     RETURNING *`,
    [departamento_id, fecha, observaciones || null]
  );

  return result.rows[0];
}

async function approve(id) {
  const result = await pool.query(
    `UPDATE reservas
     SET estado = 'reservado', motivo_rechazo = NULL, updated_at = NOW()
     WHERE id = $1 AND estado = 'en_proceso'
     RETURNING *`,
    [id]
  );

  return result.rows[0] || null;
}

// Rechazar libera la fecha para otra solicitud.
async function reject(id, motivo) {
  const result = await pool.query(
    `UPDATE reservas
     SET estado = 'rechazado', motivo_rechazo = $2, updated_at = NOW()
     WHERE id = $1 AND estado IN ('en_proceso', 'reservado')
     RETURNING *`,
    [id, motivo]
  );

  return result.rows[0] || null;
}

async function attachComprobante(id, comprobanteUrl) {
  const result = await pool.query(
    `UPDATE reservas
     SET observaciones = CASE
           WHEN observaciones IS NULL OR observaciones = '' THEN $1
           ELSE observaciones || ' | ' || $1
         END,
         updated_at = NOW()
     WHERE id = $2
       AND estado = 'en_proceso'
       AND COALESCE(observaciones, '') NOT LIKE '%Comprobante:%'
     RETURNING *`,
    [`Comprobante: ${comprobanteUrl}`, id]
  );

  return result.rows[0] || null;
}

module.exports = {
  findAll,
  findAllByUsuarioId,
  findAllByTorreIds,
  findFechasOcupadas,
  create,
  approve,
  reject,
  attachComprobante,
};
