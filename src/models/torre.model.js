const { pool } = require('../config/database');

async function findAll() {
  const result = await pool.query('SELECT * FROM torres ORDER BY numero ASC');
  return result.rows;
}

async function findById(id) {
  const result = await pool.query('SELECT * FROM torres WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function create({ numero, total_departamentos }) {
  const result = await pool.query(
    `INSERT INTO torres (numero, total_departamentos)
     VALUES ($1, $2)
     RETURNING *`,
    [numero, total_departamentos]
  );

  return result.rows[0];
}

async function update(id, { numero, total_departamentos }) {
  const result = await pool.query(
    `UPDATE torres
     SET numero = $1,
         total_departamentos = $2
     WHERE id = $3
     RETURNING *`,
    [numero, total_departamentos, id]
  );

  return result.rows[0] || null;
}

async function remove(id) {
  const result = await pool.query('DELETE FROM torres WHERE id = $1 RETURNING *', [id]);
  return result.rows[0] || null;
}

module.exports = { findAll, findById, create, update, remove };
