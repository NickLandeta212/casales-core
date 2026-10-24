const { pool } = require('../config/database');
const HttpError = require('../utils/httpError');

// Catalogo de proveedores del conjunto, compartido por egresos y mantenimientos.

async function findProveedores({ soloActivos = false } = {}) {
  const where = soloActivos ? 'WHERE activo = TRUE' : '';
  const result = await pool.query(`SELECT * FROM proveedores ${where} ORDER BY nombre ASC`);
  return result.rows;
}

async function findProveedorById(id) {
  const result = await pool.query('SELECT * FROM proveedores WHERE id = $1', [id]);
  return result.rows[0] || null;
}

function errorRucDuplicado(error) {
  if (error.code === '23505') {
    return new HttpError(409, 'Ya existe un proveedor con ese RUC');
  }

  return error;
}

async function createProveedor({ nombre, ruc, telefono, email }) {
  try {
    const result = await pool.query(
      `INSERT INTO proveedores (nombre, ruc, telefono, email) VALUES ($1, $2, $3, $4) RETURNING *`,
      [nombre, ruc, telefono, email]
    );
    return result.rows[0];
  } catch (error) {
    throw errorRucDuplicado(error);
  }
}

async function updateProveedor(id, { nombre, ruc, telefono, email, activo }) {
  try {
    const result = await pool.query(
      `UPDATE proveedores
       SET nombre = $2, ruc = $3, telefono = $4, email = $5, activo = $6, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, nombre, ruc, telefono, email, activo]
    );
    return result.rows[0] || null;
  } catch (error) {
    throw errorRucDuplicado(error);
  }
}

module.exports = { findProveedores, findProveedorById, createProveedor, updateProveedor };
