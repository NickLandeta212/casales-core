const { pool } = require('../config/database');

async function findAll() {
  const result = await pool.query('SELECT * FROM torres ORDER BY numero ASC');
  return result.rows;
}

async function findByIds(ids) {
  const torreIds = Array.isArray(ids)
    ? ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
    : [];

  if (torreIds.length === 0) {
    return [];
  }

  const result = await pool.query(
    'SELECT * FROM torres WHERE id = ANY($1::integer[]) ORDER BY numero ASC',
    [torreIds]
  );

  return result.rows;
}

async function findById(id) {
  const result = await pool.query('SELECT * FROM torres WHERE id = $1', [id]);
  return result.rows[0] || null;
}

module.exports = { findAll, findByIds, findById };
