const { pool } = require('../config/database');

async function create(entry) {
  await pool.query(
    `INSERT INTO auditoria (usuario_id, usuario_nombre, role, modulo, accion, detalle, metodo, ruta, status, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      entry.usuario_id || null,
      entry.usuario_nombre || null,
      entry.role || null,
      entry.modulo,
      entry.accion,
      entry.detalle || null,
      entry.metodo,
      entry.ruta,
      entry.status,
      entry.ip || null,
    ]
  );
}

async function findRecent({ limit = 300, modulo = null } = {}) {
  const values = [Math.min(Math.max(Number(limit) || 300, 1), 1000)];
  let where = '';

  if (modulo) {
    values.push(modulo);
    where = 'WHERE modulo = $2';
  }

  const result = await pool.query(
    `SELECT id, created_at, usuario_id, usuario_nombre, role, modulo, accion, detalle, metodo, ruta, status, ip
     FROM auditoria
     ${where}
     ORDER BY created_at DESC
     LIMIT $1`,
    values
  );

  return result.rows;
}

module.exports = { create, findRecent };
