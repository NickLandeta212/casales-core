const { pool } = require('../config/database');

async function findAll() {
  const result = await pool.query(
    `SELECT r.*, d.numero AS departamento_numero, t.numero AS torre_numero
     FROM reservas r
     INNER JOIN departamentos d ON d.id = r.departamento_id
     INNER JOIN torres t ON t.id = d.torre_id
     ORDER BY r.fecha DESC, r.created_at DESC`
  );

  return result.rows;
}

async function findById(id) {
  const result = await pool.query(
    `SELECT r.*, d.numero AS departamento_numero, t.numero AS torre_numero
     FROM reservas r
     INNER JOIN departamentos d ON d.id = r.departamento_id
     INNER JOIN torres t ON t.id = d.torre_id
     WHERE r.id = $1`,
    [id]
  );

  return result.rows[0] || null;
}

async function findAllByUsuarioId(usuario_id) {
  const result = await pool.query(
    `SELECT r.*, d.numero AS departamento_numero, t.numero AS torre_numero
     FROM reservas r
     INNER JOIN departamentos d ON d.id = r.departamento_id
     INNER JOIN torres t ON t.id = d.torre_id
     WHERE d.usuario_id = $1
     ORDER BY r.fecha DESC, r.created_at DESC`,
    [usuario_id]
  );

  return result.rows;
}

async function findByIdForUsuario(id, usuario_id) {
  const result = await pool.query(
    `SELECT r.*, d.numero AS departamento_numero, t.numero AS torre_numero
     FROM reservas r
     INNER JOIN departamentos d ON d.id = r.departamento_id
     INNER JOIN torres t ON t.id = d.torre_id
     WHERE r.id = $1 AND d.usuario_id = $2`,
    [id, usuario_id]
  );

  return result.rows[0] || null;
}

async function isDepartamentoOwnedByUsuario(departamento_id, usuario_id) {
  const result = await pool.query(
    'SELECT id FROM departamentos WHERE id = $1 AND usuario_id = $2 LIMIT 1',
    [departamento_id, usuario_id]
  );

  return result.rowCount > 0;
}

async function create({ departamento_id, fecha, estado, observaciones }) {
  const result = await pool.query(
    `INSERT INTO reservas (departamento_id, fecha, estado, observaciones)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [departamento_id, fecha, estado, observaciones || null]
  );

  return result.rows[0];
}

async function update(id, { departamento_id, fecha, estado, observaciones }) {
  const result = await pool.query(
    `UPDATE reservas
     SET departamento_id = $1,
         fecha = $2,
         estado = $3,
         observaciones = $4,
         updated_at = NOW()
     WHERE id = $5
     RETURNING *`,
    [departamento_id, fecha, estado, observaciones || null, id]
  );

  return result.rows[0] || null;
}

async function remove(id) {
  const result = await pool.query('DELETE FROM reservas WHERE id = $1 RETURNING *', [id]);
  return result.rows[0] || null;
}

async function findReservedDates() {
  const result = await pool.query(
    `SELECT TO_CHAR(fecha, 'YYYY-MM-DD') AS fecha
     FROM reservas
     WHERE fecha >= CURRENT_DATE
     ORDER BY fecha ASC`
  );

  return result.rows.map((row) => row.fecha);
}

module.exports = {
  findAll,
  findById,
  findAllByUsuarioId,
  findByIdForUsuario,
  isDepartamentoOwnedByUsuario,
  create,
  update,
  remove,
  findReservedDates,
};
