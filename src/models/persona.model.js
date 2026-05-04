const { pool } = require('../config/database');

async function findAll() {
  const result = await pool.query(
    `SELECT p.*,
            ROW_NUMBER() OVER (ORDER BY p.id ASC)::int AS numero_consecutivo,
            d.numero AS departamento_numero,
            t.numero AS torre_numero
     FROM personas p
     INNER JOIN departamentos d ON d.id = p.departamento_id
     INNER JOIN torres t ON t.id = d.torre_id
     ORDER BY p.id ASC`
  );

  return result.rows;
}

async function findById(id) {
  const result = await pool.query(
    `SELECT p.*, p.id AS numero_consecutivo, d.numero AS departamento_numero, t.numero AS torre_numero
     FROM personas p
     INNER JOIN departamentos d ON d.id = p.departamento_id
     INNER JOIN torres t ON t.id = d.torre_id
     WHERE p.id = $1`,
    [id]
  );

  return result.rows[0] || null;
}

async function findAllByUsuarioId(usuario_id) {
  const result = await pool.query(
    `SELECT p.*,
            ROW_NUMBER() OVER (ORDER BY p.id ASC)::int AS numero_consecutivo,
            d.numero AS departamento_numero,
            t.numero AS torre_numero
     FROM personas p
     INNER JOIN departamentos d ON d.id = p.departamento_id
     INNER JOIN torres t ON t.id = d.torre_id
     WHERE d.usuario_id = $1
     ORDER BY p.id ASC`,
    [usuario_id]
  );

  return result.rows;
}

async function findAllByTorreIds(torre_ids) {
  const ids = Array.isArray(torre_ids)
    ? torre_ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
    : [];

  if (ids.length === 0) {
    return [];
  }

  const result = await pool.query(
    `SELECT p.*,
            ROW_NUMBER() OVER (ORDER BY p.id ASC)::int AS numero_consecutivo,
            d.numero AS departamento_numero,
            t.numero AS torre_numero
     FROM personas p
     INNER JOIN departamentos d ON d.id = p.departamento_id
     INNER JOIN torres t ON t.id = d.torre_id
     WHERE d.torre_id = ANY($1::int[])
     ORDER BY p.id ASC`,
    [ids]
  );

  return result.rows;
}

async function findByIdForTorreIds(id, torre_ids) {
  const ids = Array.isArray(torre_ids)
    ? torre_ids.map((torreId) => Number(torreId)).filter((torreId) => Number.isInteger(torreId) && torreId > 0)
    : [];

  if (ids.length === 0) {
    return null;
  }

  const result = await pool.query(
    `SELECT p.*, p.id AS numero_consecutivo, d.numero AS departamento_numero, t.numero AS torre_numero
     FROM personas p
     INNER JOIN departamentos d ON d.id = p.departamento_id
     INNER JOIN torres t ON t.id = d.torre_id
     WHERE p.id = $1 AND d.torre_id = ANY($2::int[])`,
    [id, ids]
  );

  return result.rows[0] || null;
}

async function isDepartamentoInTorreIds(departamento_id, torre_ids) {
  const ids = Array.isArray(torre_ids)
    ? torre_ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
    : [];

  if (ids.length === 0) {
    return false;
  }

  const result = await pool.query(
    'SELECT id FROM departamentos WHERE id = $1 AND torre_id = ANY($2::int[]) LIMIT 1',
    [departamento_id, ids]
  );

  return result.rowCount > 0;
}

async function findByIdForUsuario(id, usuario_id) {
  const result = await pool.query(
    `SELECT p.*, p.id AS numero_consecutivo, d.numero AS departamento_numero, t.numero AS torre_numero
     FROM personas p
     INNER JOIN departamentos d ON d.id = p.departamento_id
     INNER JOIN torres t ON t.id = d.torre_id
     WHERE p.id = $1 AND d.usuario_id = $2`,
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

async function create({ departamento_id, nombres, apellidos, documento, telefono, tipo_ocupacion }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const departamentoResult = await client.query(
      'SELECT id FROM departamentos WHERE id = $1 FOR UPDATE',
      [departamento_id]
    );

    if (departamentoResult.rowCount === 0) {
      const error = new Error('Departamento no encontrado');
      error.statusCode = 404;
      throw error;
    }

    const countResult = await client.query(
      'SELECT COUNT(*)::int AS total FROM personas WHERE departamento_id = $1',
      [departamento_id]
    );

    if (countResult.rows[0].total >= 10) {
      const error = new Error('El departamento ya tiene el maximo de 10 personas registradas');
      error.statusCode = 400;
      throw error;
    }

    const inserted = await client.query(
      `INSERT INTO personas (departamento_id, nombres, apellidos, documento, telefono, tipo_ocupacion)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [departamento_id, nombres, apellidos, documento, telefono || null, tipo_ocupacion || 'dueno']
    );

    await client.query('COMMIT');
    return inserted.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function update(id, { departamento_id, nombres, apellidos, documento, telefono, tipo_ocupacion }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const existing = await client.query('SELECT id FROM personas WHERE id = $1 FOR UPDATE', [id]);

    if (existing.rowCount === 0) {
      await client.query('COMMIT');
      return null;
    }

    const departamentoResult = await client.query(
      'SELECT id FROM departamentos WHERE id = $1 FOR UPDATE',
      [departamento_id]
    );

    if (departamentoResult.rowCount === 0) {
      const error = new Error('Departamento no encontrado');
      error.statusCode = 404;
      throw error;
    }

    const countResult = await client.query(
      'SELECT COUNT(*)::int AS total FROM personas WHERE departamento_id = $1 AND id <> $2',
      [departamento_id, id]
    );

    if (countResult.rows[0].total >= 10) {
      const error = new Error('El departamento ya tiene el maximo de 10 personas registradas');
      error.statusCode = 400;
      throw error;
    }

    const updated = await client.query(
      `UPDATE personas
       SET departamento_id = $1,
           nombres = $2,
           apellidos = $3,
           documento = $4,
           telefono = $5,
           tipo_ocupacion = $6
       WHERE id = $7
       RETURNING *`,
      [departamento_id, nombres, apellidos, documento, telefono || null, tipo_ocupacion || 'dueno', id]
    );

    await client.query('COMMIT');
    return updated.rows[0] || null;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function remove(id) {
  const result = await pool.query('DELETE FROM personas WHERE id = $1 RETURNING *', [id]);
  return result.rows[0] || null;
}

module.exports = {
  findAll,
  findById,
  findAllByUsuarioId,
  findAllByTorreIds,
  findByIdForUsuario,
  findByIdForTorreIds,
  isDepartamentoOwnedByUsuario,
  isDepartamentoInTorreIds,
  create,
  update,
  remove,
};
