const bcrypt = require('bcryptjs');
const { pool } = require('../../src/config/database');

module.exports = async function upsertUser({ nombre, email, password, role }) {
  const normalizedName = String(nombre).trim();
  const normalizedEmail = String(email).trim().toLowerCase();
  const passwordHash = await bcrypt.hash(String(password), 10);

  const result = await pool.query(
    `INSERT INTO usuarios (nombre, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email)
     DO UPDATE
       SET nombre = EXCLUDED.nombre,
           password_hash = EXCLUDED.password_hash,
           role = EXCLUDED.role
     RETURNING id, nombre, email, role`,
    [normalizedName, normalizedEmail, passwordHash, role]
  );

  await pool.end();
  return result.rows[0];
};
