const { pool } = require('../config/database');

async function findAll() {
  const result = await pool.query(
    `SELECT d.*,
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
            )::int AS numero_consecutivo,
            t.numero AS torre_numero,
            u.nombre AS usuario_nombre,
            u.email AS usuario_email,
            u.role AS usuario_role
     FROM departamentos d
     INNER JOIN torres t ON t.id = d.torre_id
     LEFT JOIN usuarios u ON u.id = d.usuario_id
     ORDER BY t.numero ASC,
              CASE
                WHEN d.numero ~ '^T[0-9]+SS' THEN 1
                WHEN d.numero ~ '^T[0-9]+PB' THEN 2
                WHEN d.numero ~ '^T[0-9]+D' THEN 3
                ELSE 99
              END ASC,
              d.numero ASC,
              d.id ASC`
  );

  return result.rows;
}

async function findById(id) {
  const result = await pool.query(
    `SELECT d.*, d.id AS numero_consecutivo, t.numero AS torre_numero, u.nombre AS usuario_nombre, u.email AS usuario_email, u.role AS usuario_role
     FROM departamentos d
     INNER JOIN torres t ON t.id = d.torre_id
     LEFT JOIN usuarios u ON u.id = d.usuario_id
     WHERE d.id = $1`,
    [id]
  );

  return result.rows[0] || null;
}

async function findByUsuarioId(usuario_id) {
  const result = await pool.query(
    `SELECT d.*,
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
            )::int AS numero_consecutivo,
            t.numero AS torre_numero,
            u.nombre AS usuario_nombre,
            u.email AS usuario_email,
            u.role AS usuario_role
     FROM departamentos d
     INNER JOIN torres t ON t.id = d.torre_id
     LEFT JOIN usuarios u ON u.id = d.usuario_id
     WHERE d.usuario_id = $1
     ORDER BY t.numero ASC,
              CASE
                WHEN d.numero ~ '^T[0-9]+SS' THEN 1
                WHEN d.numero ~ '^T[0-9]+PB' THEN 2
                WHEN d.numero ~ '^T[0-9]+D' THEN 3
                ELSE 99
              END ASC,
              d.numero ASC,
              d.id ASC`,
    [usuario_id]
  );

  return result.rows;
}

async function findByTorreIds(torre_ids) {
  const ids = Array.isArray(torre_ids)
    ? torre_ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
    : [];

  if (ids.length === 0) {
    return [];
  }

  const result = await pool.query(
    `SELECT d.*,
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
            )::int AS numero_consecutivo,
            t.numero AS torre_numero,
            u.nombre AS usuario_nombre,
            u.email AS usuario_email,
            u.role AS usuario_role
     FROM departamentos d
     INNER JOIN torres t ON t.id = d.torre_id
     LEFT JOIN usuarios u ON u.id = d.usuario_id
     WHERE d.torre_id = ANY($1::int[])
     ORDER BY t.numero ASC,
              CASE
                WHEN d.numero ~ '^T[0-9]+SS' THEN 1
                WHEN d.numero ~ '^T[0-9]+PB' THEN 2
                WHEN d.numero ~ '^T[0-9]+D' THEN 3
                ELSE 99
              END ASC,
              d.numero ASC,
              d.id ASC`,
    [ids]
  );

  return result.rows;
}

async function remove(id) {
  const result = await pool.query('DELETE FROM departamentos WHERE id = $1 RETURNING *', [id]);
  return result.rows[0] || null;
}

module.exports = { findAll, findById, findByUsuarioId, findByTorreIds, remove };
