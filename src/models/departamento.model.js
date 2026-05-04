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

function buildCodigoDepartamento(torreNumero, codigoTipo, codigoNumero) {
  return `T${torreNumero}${codigoTipo}${codigoNumero}`;
}

async function create({ torre_id, codigo_tipo, codigo_numero, usuario_id }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const torre = await client.query('SELECT id, numero FROM torres WHERE id = $1 FOR SHARE', [torre_id]);

    if (torre.rowCount === 0) {
      const error = new Error('Torre no encontrada');
      error.statusCode = 404;
      throw error;
    }

    const numero = buildCodigoDepartamento(torre.rows[0].numero, codigo_tipo, codigo_numero);

    // Check if code already exists in this tower
    const existsCheck = await client.query(
      'SELECT id FROM departamentos WHERE torre_id = $1 AND numero = $2',
      [torre_id, numero]
    );

    if (existsCheck.rowCount > 0) {
      const error = new Error(`El codigo ${numero} ya existe en esta torre`);
      error.statusCode = 400;
      throw error;
    }

    const inserted = await client.query(
      `INSERT INTO departamentos (torre_id, numero, usuario_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [torre_id, numero, usuario_id || null]
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

async function update(id, { torre_id, codigo_tipo, codigo_numero, usuario_id }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const torre = await client.query('SELECT id, numero FROM torres WHERE id = $1 FOR SHARE', [torre_id]);

    if (torre.rowCount === 0) {
      const error = new Error('Torre no encontrada');
      error.statusCode = 404;
      throw error;
    }

    const numero = buildCodigoDepartamento(torre.rows[0].numero, codigo_tipo, codigo_numero);

    // Check if code already exists in this tower (excluding current record)
    const existsCheck = await client.query(
      'SELECT id FROM departamentos WHERE torre_id = $1 AND numero = $2 AND id <> $3',
      [torre_id, numero, id]
    );

    if (existsCheck.rowCount > 0) {
      const error = new Error(`El codigo ${numero} ya existe en esta torre`);
      error.statusCode = 400;
      throw error;
    }

    const updated = await client.query(
      `UPDATE departamentos
       SET torre_id = $1,
           numero = $2,
           usuario_id = $3
       WHERE id = $4
       RETURNING *`,
      [torre_id, numero, usuario_id || null, id]
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
  const result = await pool.query('DELETE FROM departamentos WHERE id = $1 RETURNING *', [id]);
  return result.rows[0] || null;
}

module.exports = { findAll, findById, findByUsuarioId, findByTorreIds, create, update, remove };
