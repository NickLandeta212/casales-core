const { pool } = require('../config/database');

const SELECT = `
  SELECT f.id, TO_CHAR(f.fecha, 'YYYY-MM-DD') AS fecha, f.concepto, f.tipo, f.valor, f.estado, f.alcance,
         f.torre_id, t.numero AS torre_numero, f.origen, f.origen_id, f.created_at, u.nombre AS creado_por_nombre
  FROM finanzas_movimientos f
  LEFT JOIN torres t ON t.id = f.torre_id
  LEFT JOIN usuarios u ON u.id = f.creado_por`;

// torre_ids null = sin restriccion. alcance opcional: 'conjunto' | 'torre'.
async function findAll({ alcance = null, torre_ids = null } = {}) {
  const filters = [];
  const values = [];

  if (alcance) {
    values.push(alcance);
    filters.push(`f.alcance = $${values.length}`);
  }

  if (Array.isArray(torre_ids)) {
    values.push(torre_ids);
    filters.push(`f.torre_id = ANY($${values.length}::int[])`);
  }

  const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
  const result = await pool.query(`${SELECT} ${where} ORDER BY f.fecha DESC, f.id DESC`, values);
  return result.rows;
}

async function findById(id) {
  const result = await pool.query(`${SELECT} WHERE f.id = $1`, [id]);
  return result.rows[0] || null;
}

async function create({ fecha, concepto, tipo, valor, estado, alcance, torre_id, creado_por }) {
  const result = await pool.query(
    `INSERT INTO finanzas_movimientos (fecha, concepto, tipo, valor, estado, alcance, torre_id, creado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [fecha, concepto, tipo, valor, estado, alcance, torre_id, creado_por]
  );

  return findById(result.rows[0].id);
}

async function remove(id) {
  const result = await pool.query('DELETE FROM finanzas_movimientos WHERE id = $1 RETURNING *', [id]);
  return result.rows[0] || null;
}

// Movimientos que genera la aprobacion de un pago. Recibe el cliente de la transaccion
// de aprobacion para que el pago y su registro contable se confirmen (o reviertan) juntos.
async function registrarPagoAprobado(client, movimientos) {
  for (const m of movimientos) {
    await client.query(
      `INSERT INTO finanzas_movimientos (fecha, concepto, tipo, valor, estado, alcance, torre_id, creado_por, origen, origen_id)
       VALUES (CURRENT_DATE, $1, $2, $3, 'pagado', $4, $5, $6, $7, $8)
       ON CONFLICT DO NOTHING`,
      [m.concepto, m.tipo, m.valor, m.alcance, m.torre_id, m.creado_por || null, m.origen, m.origen_id]
    );
  }
}

module.exports = { findAll, findById, create, remove, registrarPagoAprobado };
