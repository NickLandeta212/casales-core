const { pool } = require('../config/database');

const SELECT = `
  SELECT c.id, c.titulo, c.contenido, c.fijado, c.created_at, c.updated_at, u.nombre AS creado_por_nombre
  FROM comunicados c
  LEFT JOIN usuarios u ON u.id = c.creado_por`;

// Los fijados van primero; dentro de cada grupo, del mas reciente al mas antiguo.
async function findAll({ limit = null } = {}) {
  const values = [];
  let limitClause = '';

  if (limit) {
    values.push(limit);
    limitClause = `LIMIT $${values.length}`;
  }

  const result = await pool.query(`${SELECT} ORDER BY c.fijado DESC, c.created_at DESC, c.id DESC ${limitClause}`, values);
  return result.rows;
}

async function findById(id) {
  const result = await pool.query(`${SELECT} WHERE c.id = $1`, [id]);
  return result.rows[0] || null;
}

async function create({ titulo, contenido, fijado, creado_por }) {
  const result = await pool.query(
    `INSERT INTO comunicados (titulo, contenido, fijado, creado_por)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [titulo, contenido, fijado, creado_por]
  );

  return findById(result.rows[0].id);
}

async function update(id, { titulo, contenido, fijado }) {
  const result = await pool.query(
    `UPDATE comunicados
     SET titulo = $1, contenido = $2, fijado = $3, updated_at = NOW()
     WHERE id = $4
     RETURNING id`,
    [titulo, contenido, fijado, id]
  );

  return result.rows[0] ? findById(id) : null;
}

async function remove(id) {
  const result = await pool.query('DELETE FROM comunicados WHERE id = $1 RETURNING id, titulo', [id]);
  return result.rows[0] || null;
}

module.exports = { findAll, findById, create, update, remove };
