const { pool, withTransaction } = require('../config/database');
const HttpError = require('../utils/httpError');
const { normalizeIds } = require('../utils/validators');

const MAX_PERSONAS_POR_DEPARTAMENTO = 10;

const PERSONA_JOINS = `
  FROM personas p
  INNER JOIN departamentos d ON d.id = p.departamento_id
  INNER JOIN torres t ON t.id = d.torre_id`;

// En los listados el consecutivo es la posicion dentro del resultado; en el detalle, el id.
const LISTA_SELECT = `
  SELECT p.*,
         ROW_NUMBER() OVER (ORDER BY p.id ASC)::int AS numero_consecutivo,
         d.numero AS departamento_numero,
         t.numero AS torre_numero
  ${PERSONA_JOINS}`;

const DETALLE_SELECT = `
  SELECT p.*, p.id AS numero_consecutivo, d.numero AS departamento_numero, t.numero AS torre_numero
  ${PERSONA_JOINS}`;

async function findAll() {
  const result = await pool.query(`${LISTA_SELECT} ORDER BY p.id ASC`);
  return result.rows;
}

async function findById(id) {
  const result = await pool.query(`${DETALLE_SELECT} WHERE p.id = $1`, [id]);
  return result.rows[0] || null;
}

async function findAllByTorreIds(torre_ids) {
  const ids = normalizeIds(torre_ids);

  if (ids.length === 0) {
    return [];
  }

  const result = await pool.query(`${LISTA_SELECT} WHERE d.torre_id = ANY($1::int[]) ORDER BY p.id ASC`, [ids]);
  return result.rows;
}

async function findByIdForTorreIds(id, torre_ids) {
  const ids = normalizeIds(torre_ids);

  if (ids.length === 0) {
    return null;
  }

  const result = await pool.query(`${DETALLE_SELECT} WHERE p.id = $1 AND d.torre_id = ANY($2::int[])`, [id, ids]);
  return result.rows[0] || null;
}

async function isDepartamentoInTorreIds(departamento_id, torre_ids) {
  const ids = normalizeIds(torre_ids);

  if (ids.length === 0) {
    return false;
  }

  const result = await pool.query(
    'SELECT id FROM departamentos WHERE id = $1 AND torre_id = ANY($2::int[]) LIMIT 1',
    [departamento_id, ids]
  );

  return result.rowCount > 0;
}

// Bloquea el departamento y verifica que aun tenga cupo, sin contar a excludePersonaId.
async function ensureCupoEnDepartamento(client, departamento_id, excludePersonaId = null) {
  const departamento = await client.query('SELECT id FROM departamentos WHERE id = $1 FOR UPDATE', [departamento_id]);

  if (departamento.rowCount === 0) {
    throw new HttpError(404, 'Departamento no encontrado');
  }

  const count = await client.query(
    'SELECT COUNT(*)::int AS total FROM personas WHERE departamento_id = $1 AND ($2::bigint IS NULL OR id <> $2)',
    [departamento_id, excludePersonaId]
  );

  if (count.rows[0].total >= MAX_PERSONAS_POR_DEPARTAMENTO) {
    throw new HttpError(400, `El departamento ya tiene el maximo de ${MAX_PERSONAS_POR_DEPARTAMENTO} personas registradas`);
  }
}

async function create({ departamento_id, nombres, apellidos, documento, telefono, tipo_ocupacion }) {
  return withTransaction(async (client) => {
    await ensureCupoEnDepartamento(client, departamento_id);

    const inserted = await client.query(
      `INSERT INTO personas (departamento_id, nombres, apellidos, documento, telefono, tipo_ocupacion)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [departamento_id, nombres, apellidos, documento, telefono || null, tipo_ocupacion || 'dueno']
    );

    return inserted.rows[0];
  });
}

async function update(id, { departamento_id, nombres, apellidos, documento, telefono, tipo_ocupacion }) {
  return withTransaction(async (client) => {
    const existing = await client.query('SELECT id FROM personas WHERE id = $1 FOR UPDATE', [id]);

    if (existing.rowCount === 0) {
      return null;
    }

    await ensureCupoEnDepartamento(client, departamento_id, id);

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

    return updated.rows[0] || null;
  });
}

async function remove(id) {
  const result = await pool.query('DELETE FROM personas WHERE id = $1 RETURNING *', [id]);
  return result.rows[0] || null;
}

async function updateMovilidad(id, { vehiculo, parqueadero }) {
  const result = await pool.query(
    'UPDATE personas SET vehiculo = $1, parqueadero = $2 WHERE id = $3 RETURNING *',
    [vehiculo || null, parqueadero || null, id]
  );
  return result.rows[0] || null;
}

module.exports = {
  updateMovilidad,
  findAll,
  findById,
  findAllByTorreIds,
  findByIdForTorreIds,
  isDepartamentoInTorreIds,
  create,
  update,
  remove,
};
