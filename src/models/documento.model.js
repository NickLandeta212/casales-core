const { pool } = require('../config/database');

// Archivo de documentos del conjunto (reglamento, actas, contratos).

const SELECT = `
  SELECT d.id, d.titulo, d.categoria, d.descripcion, d.archivo_url, d.visibilidad, d.created_at,
         u.nombre AS subido_por_nombre
  FROM documentos d
  LEFT JOIN usuarios u ON u.id = d.subido_por`;

// soloPublicos: true para quienes solo pueden ver los documentos visibles para todos.
async function findAll({ soloPublicos }) {
  const where = soloPublicos ? "WHERE d.visibilidad = 'todos'" : '';
  const result = await pool.query(`${SELECT} ${where} ORDER BY d.categoria ASC, d.created_at DESC`);
  return result.rows;
}

async function findById(id) {
  const result = await pool.query(`${SELECT} WHERE d.id = $1`, [id]);
  return result.rows[0] || null;
}

async function create({ titulo, categoria, descripcion, archivo_url, visibilidad, subido_por }) {
  const result = await pool.query(
    `INSERT INTO documentos (titulo, categoria, descripcion, archivo_url, visibilidad, subido_por)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [titulo, categoria, descripcion, archivo_url, visibilidad, subido_por]
  );
  return findById(result.rows[0].id);
}

async function remove(id) {
  const result = await pool.query('DELETE FROM documentos WHERE id = $1 RETURNING *', [id]);
  return result.rows[0] || null;
}

module.exports = { findAll, findById, create, remove };
