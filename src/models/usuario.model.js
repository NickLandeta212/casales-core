const { pool, withTransaction } = require('../config/database');
const HttpError = require('../utils/httpError');

const PUBLIC_COLUMNS = 'id, nombre, email, role, page_permissions, torre_ids, must_change_password, created_at';

async function findByLogin(login) {
  const value = String(login || '').trim();
  const columns = `${PUBLIC_COLUMNS}, password_hash`;

  const byEmail = await pool.query(
    `SELECT ${columns} FROM usuarios WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [value]
  );

  if (byEmail.rows[0]) {
    return byEmail.rows[0];
  }

  // El nombre (ej. T1D101) solo sirve como usuario si es unico; si hay duplicados se exige el correo.
  const byNombre = await pool.query(
    `SELECT ${columns} FROM usuarios WHERE LOWER(nombre) = LOWER($1) LIMIT 2`,
    [value]
  );

  return byNombre.rowCount === 1 ? byNombre.rows[0] : null;
}

async function findPasswordHashById(id) {
  const result = await pool.query('SELECT password_hash FROM usuarios WHERE id = $1 LIMIT 1', [id]);
  return result.rows[0]?.password_hash || null;
}

async function updatePassword(id, password_hash, { mustChange = false } = {}) {
  const result = await pool.query(
    'UPDATE usuarios SET password_hash = $1, must_change_password = $2 WHERE id = $3',
    [password_hash, mustChange, id]
  );
  return result.rowCount > 0;
}

async function findById(id) {
  const result = await pool.query(`SELECT ${PUBLIC_COLUMNS} FROM usuarios WHERE id = $1 LIMIT 1`, [id]);
  return result.rows[0] || null;
}

async function findAll() {
  const result = await pool.query(`SELECT ${PUBLIC_COLUMNS} FROM usuarios ORDER BY id ASC`);
  return result.rows;
}

async function create({ nombre, email, password_hash, role, torre_id, page_permissions, torre_ids }) {
  return withTransaction(async (client) => {
    const torreResult = await client.query(
      'SELECT id, numero FROM torres WHERE id = $1 FOR UPDATE',
      [torre_id]
    );

    if (torreResult.rowCount === 0) {
      throw new HttpError(404, 'Torre no encontrada');
    }

    // Los usuarios creados por un administrador reciben una contrasena temporal.
    const result = await client.query(
      `INSERT INTO usuarios (nombre, email, password_hash, role, page_permissions, torre_ids, must_change_password)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::integer[], TRUE)
       RETURNING ${PUBLIC_COLUMNS}`,
      [nombre, email, password_hash, role, JSON.stringify(page_permissions || []), torre_ids || []]
    );

    const user = result.rows[0];
    let departamentoId = null;

    // Solo un condomino queda asociado a un departamento (el primero libre de su torre).
    if (role === 'condomino') {
      const departamentoLibre = await client.query(
        `SELECT id
         FROM departamentos
         WHERE torre_id = $1
           AND usuario_id IS NULL
         ORDER BY id ASC
         LIMIT 1
         FOR UPDATE`,
        [torre_id]
      );

      if (departamentoLibre.rowCount > 0) {
        departamentoId = departamentoLibre.rows[0].id;
        await client.query('UPDATE departamentos SET usuario_id = $1 WHERE id = $2', [user.id, departamentoId]);
      }
    }

    return {
      ...user,
      torre_id: torreResult.rows[0].id,
      torre_numero: torreResult.rows[0].numero,
      departamento_id: departamentoId,
    };
  });
}

async function update(id, { nombre, email, password_hash, role, page_permissions, torre_ids }) {
  const values = [nombre, email, role, JSON.stringify(page_permissions || []), torre_ids || []];
  let passwordSet = '';

  // Una contrasena asignada por un administrador es temporal: el usuario debe cambiarla.
  if (password_hash) {
    values.push(password_hash);
    passwordSet = `, password_hash = $${values.length}, must_change_password = TRUE`;
  }

  values.push(id);

  const result = await pool.query(
    `UPDATE usuarios
     SET nombre = $1,
         email = $2,
         role = $3,
         page_permissions = $4::jsonb,
         torre_ids = $5::integer[]${passwordSet}
     WHERE id = $${values.length}
     RETURNING ${PUBLIC_COLUMNS}`,
    values
  );

  return result.rows[0] || null;
}

async function remove(id) {
  const result = await pool.query(`DELETE FROM usuarios WHERE id = $1 RETURNING ${PUBLIC_COLUMNS}`, [id]);
  return result.rows[0] || null;
}

// Correos reales para avisos generales (asambleas, recordatorios). Los condominos suelen tener un correo
// interno @casales.app que no recibe mensajes, por eso se suman los correos que dejaron al enviar pagos.
// roles: limita los usuarios a esos roles (los correos de pagos solo se suman si se incluye 'condomino').
async function findCorreosParaAvisos(roles) {
  const result = await pool.query(
    `SELECT DISTINCT LOWER(TRIM(email)) AS email
     FROM (
       SELECT email FROM usuarios WHERE role = ANY($1::text[])
       UNION ALL SELECT email_destinatario FROM pagos_alicuotas WHERE 'condomino' = ANY($1::text[])
       UNION ALL SELECT email_destinatario FROM pagos_multas WHERE 'condomino' = ANY($1::text[])
       UNION ALL SELECT email_destinatario FROM pagos_cargos WHERE 'condomino' = ANY($1::text[])
     ) correos
     WHERE email LIKE '%_@_%._%' AND LOWER(email) NOT LIKE '%@casales.app'
     ORDER BY 1`,
    [roles]
  );

  return result.rows.map((row) => row.email);
}

module.exports = { findByLogin, findPasswordHashById, updatePassword, findById, findAll, create, update, remove, findCorreosParaAvisos };
