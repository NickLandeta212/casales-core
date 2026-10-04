const { pool } = require('../config/database');

const SELECT = `
  SELECT s.id, s.departamento_id, s.tipo, s.asunto, s.descripcion, s.estado, s.respuesta, s.created_at, s.updated_at,
         d.numero AS departamento_numero, d.torre_id, t.numero AS torre_numero,
         a.nombre AS atendido_por_nombre
  FROM solicitudes s
  INNER JOIN departamentos d ON d.id = s.departamento_id
  INNER JOIN torres t ON t.id = d.torre_id
  LEFT JOIN usuarios a ON a.id = s.atendido_por`;

// Sin filtros devuelve todas. usuario_id: las del departamento de ese condomino. torre_ids: las de esas torres.
async function findAll({ usuario_id = null, torre_ids = null } = {}) {
  const filters = [];
  const values = [];

  if (usuario_id) {
    values.push(usuario_id);
    filters.push(`d.usuario_id = $${values.length}`);
  }

  if (Array.isArray(torre_ids)) {
    values.push(torre_ids);
    filters.push(`d.torre_id = ANY($${values.length}::int[])`);
  }

  const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
  const result = await pool.query(`${SELECT} ${where} ORDER BY s.created_at DESC, s.id DESC LIMIT 500`, values);
  return result.rows;
}

async function findById(id) {
  const result = await pool.query(`${SELECT} WHERE s.id = $1`, [id]);
  return result.rows[0] || null;
}

async function create({ departamento_id, tipo, asunto, descripcion, creado_por }) {
  const result = await pool.query(
    `INSERT INTO solicitudes (departamento_id, tipo, asunto, descripcion, creado_por)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [departamento_id, tipo, asunto, descripcion, creado_por]
  );

  return findById(result.rows[0].id);
}

async function atender(id, { estado, respuesta, atendido_por }) {
  await pool.query(
    `UPDATE solicitudes
     SET estado = $1, respuesta = $2, atendido_por = $3, updated_at = NOW()
     WHERE id = $4`,
    [estado, respuesta, atendido_por, id]
  );

  return findById(id);
}

module.exports = { findAll, findById, create, atender };
