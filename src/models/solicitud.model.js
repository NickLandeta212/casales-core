const { pool } = require('../config/database');

// Destino: alcance 'conjunto' (la atiende la administracion) o 'torre' con torre_id (la atiende su tesorero).
// departamento_id es el departamento que la envio; es null si la envio el tesorero o la guardia.
const SELECT = `
  SELECT s.id, s.alcance, s.torre_id, t.numero AS torre_numero,
         s.departamento_id, d.numero AS departamento_numero, dt.numero AS departamento_torre_numero,
         s.tipo, s.asunto, s.descripcion, s.estado, s.respuesta, s.fotos,
         s.creado_por, s.created_at, s.updated_at,
         c.nombre AS creado_por_nombre, c.role AS creado_por_role,
         a.nombre AS atendido_por_nombre
  FROM solicitudes s
  LEFT JOIN torres t ON t.id = s.torre_id
  LEFT JOIN departamentos d ON d.id = s.departamento_id
  LEFT JOIN torres dt ON dt.id = d.torre_id
  LEFT JOIN usuarios c ON c.id = s.creado_por
  LEFT JOIN usuarios a ON a.id = s.atendido_por`;

// Sin filtros devuelve todas. Con filtros devuelve las que cumplan alguno:
//   departamento_de: las del departamento de ese condomino.
//   torre_ids: las dirigidas a esas torres.
//   creado_por: las que envio ese usuario.
function filtroVisibles({ departamento_de = null, torre_ids = null, creado_por = null } = {}, values = []) {
  const condiciones = [];

  if (departamento_de) {
    values.push(departamento_de);
    condiciones.push(`d.usuario_id = $${values.length}`);
  }

  if (Array.isArray(torre_ids)) {
    values.push(torre_ids);
    condiciones.push(`(s.alcance = 'torre' AND s.torre_id = ANY($${values.length}::int[]))`);
  }

  if (creado_por) {
    values.push(creado_por);
    condiciones.push(`s.creado_por = $${values.length}`);
  }

  return condiciones.length > 0 ? `(${condiciones.join(' OR ')})` : 'TRUE';
}

async function findAll(alcance) {
  const values = [];
  const where = filtroVisibles(alcance, values);
  const result = await pool.query(`${SELECT} WHERE ${where} ORDER BY s.created_at DESC, s.id DESC LIMIT 500`, values);
  return result.rows;
}

async function findById(id) {
  const result = await pool.query(`${SELECT} WHERE s.id = $1`, [id]);
  return result.rows[0] || null;
}

// La solicitud que tiene esa foto, solo si el usuario puede verla.
async function findByFoto(fotoUrl, alcance) {
  const values = [fotoUrl];
  const where = filtroVisibles(alcance, values);
  const result = await pool.query(`${SELECT} WHERE $1 = ANY(s.fotos) AND ${where} LIMIT 1`, values);
  return result.rows[0] || null;
}

async function create({ alcance, torre_id, departamento_id, tipo, asunto, descripcion, fotos, creado_por }) {
  const result = await pool.query(
    `INSERT INTO solicitudes (alcance, torre_id, departamento_id, tipo, asunto, descripcion, fotos, creado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [alcance, torre_id, departamento_id, tipo, asunto, descripcion, fotos, creado_por]
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

module.exports = { findAll, findById, findByFoto, create, atender };
