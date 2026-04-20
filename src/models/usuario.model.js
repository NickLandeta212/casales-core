const { pool } = require('../config/database');

async function findByLogin(login) {
  const result = await pool.query(
    `SELECT id, nombre, email, password_hash, role
     FROM usuarios
     WHERE LOWER(email) = LOWER($1)
        OR LOWER(nombre) = LOWER($1)
     LIMIT 1`,
    [String(login || '').trim()]
  );

  return result.rows[0] || null;
}

async function findById(id) {
  const result = await pool.query(
    'SELECT id, nombre, email, role FROM usuarios WHERE id = $1 LIMIT 1',
    [id]
  );

  return result.rows[0] || null;
}

async function findAll() {
  const result = await pool.query(
    'SELECT id, nombre, email, role, created_at FROM usuarios ORDER BY id ASC'
  );

  return result.rows;
}

async function create({ nombre, email, password_hash, role }) {
  const result = await pool.query(
    `INSERT INTO usuarios (nombre, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, nombre, email, role, created_at`,
    [nombre, email, password_hash, role]
  );

  return result.rows[0];
}

async function update(id, { nombre, email, password_hash, role }) {
  const values = [nombre, email, role, id];
  let query = `UPDATE usuarios
               SET nombre = $1,
                   email = $2,
                   role = $3`;

  if (password_hash) {
    values.splice(3, 0, password_hash);
    query += ', password_hash = $4 WHERE id = $5 RETURNING id, nombre, email, role, created_at';
  } else {
    query += ' WHERE id = $4 RETURNING id, nombre, email, role, created_at';
  }

  const result = await pool.query(query, values);
  return result.rows[0] || null;
}

async function remove(id) {
  const result = await pool.query(
    'DELETE FROM usuarios WHERE id = $1 RETURNING id, nombre, email, role, created_at',
    [id]
  );

  return result.rows[0] || null;
}

module.exports = { findByLogin, findById, findAll, create, update, remove };
