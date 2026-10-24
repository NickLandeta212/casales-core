const { pool } = require('../config/database');

// Bitacora de la guardia: novedades del turno con fotos opcionales. No se editan ni se borran.

const SELECT = `
  SELECT n.id, n.tipo, n.descripcion, n.departamento_id, d.numero AS departamento_numero, t.numero AS torre_numero,
         n.fotos, n.created_at, u.nombre AS registrado_por_nombre
  FROM novedades_guardia n
  LEFT JOIN departamentos d ON d.id = n.departamento_id
  LEFT JOIN torres t ON t.id = d.torre_id
  LEFT JOIN usuarios u ON u.id = n.registrado_por`;

const LIMITE = 300;

// desde / hasta: fechas YYYY-MM-DD (incluidas) en la zona del conjunto. tipo opcional.
async function findAll({ desde, hasta, tipo }) {
  const values = [];
  const filters = [];

  if (desde) {
    values.push(desde);
    filters.push(`(n.created_at AT TIME ZONE 'America/Guayaquil')::date >= $${values.length}`);
  }

  if (hasta) {
    values.push(hasta);
    filters.push(`(n.created_at AT TIME ZONE 'America/Guayaquil')::date <= $${values.length}`);
  }

  if (tipo) {
    values.push(tipo);
    filters.push(`n.tipo = $${values.length}`);
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const result = await pool.query(`${SELECT} ${where} ORDER BY n.created_at DESC LIMIT ${LIMITE}`, values);
  return result.rows;
}

async function findById(id) {
  const result = await pool.query(`${SELECT} WHERE n.id = $1`, [id]);
  return result.rows[0] || null;
}

async function create({ tipo, descripcion, departamento_id, fotos, registrado_por }) {
  const result = await pool.query(
    `INSERT INTO novedades_guardia (tipo, descripcion, departamento_id, fotos, registrado_por)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [tipo, descripcion, departamento_id, fotos, registrado_por]
  );
  return findById(result.rows[0].id);
}

async function existeFoto(fotoUrl) {
  const result = await pool.query('SELECT 1 FROM novedades_guardia WHERE $1 = ANY(fotos) LIMIT 1', [fotoUrl]);
  return result.rowCount > 0;
}

module.exports = { findAll, create, existeFoto };
