const { pool } = require('../config/database');

let schemaReady = false;

async function ensurePermissionColumns() {
  if (schemaReady) {
    return;
  }

  await pool.query(`
    ALTER TABLE usuarios
      ADD COLUMN IF NOT EXISTS page_permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS torre_ids INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
  `);

  schemaReady = true;
}

async function findByLogin(login) {
  await ensurePermissionColumns();

  const result = await pool.query(
    `SELECT id, nombre, email, password_hash, role, page_permissions, torre_ids
     FROM usuarios
     WHERE LOWER(email) = LOWER($1)
        OR LOWER(nombre) = LOWER($1)
     LIMIT 1`,
    [String(login || '').trim()]
  );

  return result.rows[0] || null;
}

async function findById(id) {
  await ensurePermissionColumns();

  const result = await pool.query(
    'SELECT id, nombre, email, role, page_permissions, torre_ids FROM usuarios WHERE id = $1 LIMIT 1',
    [id]
  );

  return result.rows[0] || null;
}

async function findAll() {
  await ensurePermissionColumns();

  const result = await pool.query(
    'SELECT id, nombre, email, role, page_permissions, torre_ids, created_at FROM usuarios ORDER BY id ASC'
  );

  return result.rows;
}

async function create({ nombre, email, password_hash, role, torre_id, page_permissions, torre_ids }) {
  await ensurePermissionColumns();

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
      `INSERT INTO usuarios (nombre, email, password_hash, role, page_permissions, torre_ids)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::integer[])
       RETURNING id, nombre, email, role, page_permissions, torre_ids, created_at`,
      [nombre, email, password_hash, role, JSON.stringify(page_permissions || []), torre_ids || []]
    );

    const user = result.rows[0];

    const departamentoAsignado = await client.query(
      `SELECT id
       FROM departamentos
       WHERE torre_id = $1
         AND usuario_id IS NULL
       ORDER BY id ASC
       LIMIT 1
       FOR UPDATE`,
      [torre_id]
    );

    let departamentosActualizados = 0;

    if (departamentoAsignado.rowCount > 0) {
      const updateDepartamento = await client.query(
        'UPDATE departamentos SET usuario_id = $1 WHERE id = $2',
        [user.id, departamentoAsignado.rows[0].id]
      );

      departamentosActualizados = updateDepartamento.rowCount;
    }

    await client.query('COMMIT');

    return {
      ...user,
      torre_id: torreResult.rows[0].id,
      torre_numero: torreResult.rows[0].numero,
      departamento_id: departamentoAsignado.rows[0]?.id ?? null,
      departamentos_actualizados: departamentosActualizados,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function update(id, { nombre, email, password_hash, role, page_permissions, torre_ids }) {
  await ensurePermissionColumns();

  const values = [nombre, email, role, JSON.stringify(page_permissions || []), torre_ids || [], id];
  let query = `UPDATE usuarios
               SET nombre = $1,
                   email = $2,
                   role = $3,
                   page_permissions = $4::jsonb,
                   torre_ids = $5::integer[]`;

  if (password_hash) {
    values.splice(5, 0, password_hash);
    query += ', password_hash = $6 WHERE id = $7 RETURNING id, nombre, email, role, page_permissions, torre_ids, created_at';
  } else {
    query += ' WHERE id = $6 RETURNING id, nombre, email, role, page_permissions, torre_ids, created_at';
  }

  const result = await pool.query(query, values);
  return result.rows[0] || null;
}

async function remove(id) {
  await ensurePermissionColumns();

  const result = await pool.query(
    'DELETE FROM usuarios WHERE id = $1 RETURNING id, nombre, email, role, page_permissions, torre_ids, created_at',
    [id]
  );

  return result.rows[0] || null;
}

module.exports = { findByLogin, findById, findAll, create, update, remove, ensurePermissionColumns };
