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

async function create({ nombre, email, password_hash, role, torre_id }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const torreResult = await client.query(
      'SELECT id, numero FROM torres WHERE id = $1 FOR UPDATE',
      [torre_id]
    );

    if (torreResult.rowCount === 0) {
      const error = new Error('Torre no encontrada');
      error.statusCode = 404;
      throw error;
    }

    const result = await client.query(
      `INSERT INTO usuarios (nombre, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, nombre, email, role, created_at`,
      [nombre, email, password_hash, role]
    );

    const user = result.rows[0];

    const departamentosResult = await client.query(
      'UPDATE departamentos SET usuario_id = $1 WHERE torre_id = $2',
      [user.id, torre_id]
    );

    if (departamentosResult.rowCount === 0) {
      const error = new Error('La torre no tiene departamentos para asignar al usuario');
      error.statusCode = 400;
      throw error;
    }

    await client.query('COMMIT');

    return {
      ...user,
      torre_id: torreResult.rows[0].id,
      torre_numero: torreResult.rows[0].numero,
      departamentos_actualizados: departamentosResult.rowCount,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
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
