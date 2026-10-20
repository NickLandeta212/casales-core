const { pool } = require('../config/database');
const { ADMINS } = require('../config/permisos');

// Hay dos niveles de acceso a las torres:
//   - Asignadas (getAuthorizedTorreIds): las torres del usuario. Sirven para ACTUAR (aprobar, rechazar,
//     editar valores), que es tarea del tesorero de cada torre.
//   - Visibles (getVisibleTorreIds): las asignadas y, para la administracion, todas. Sirven para CONSULTAR
//     (listados, reportes, estados de cuenta).

// Torres asignadas al usuario autenticado. authenticateToken ya las leyo de la BD,
// por lo que un cambio de permisos aplica de inmediato y no hasta que expire el token.
async function getAuthorizedTorreIds(req) {
  return Array.isArray(req.user?.torre_ids) ? req.user.torre_ids : [];
}

function isAdmin(req) {
  return ADMINS.includes(req.user?.role);
}

async function findAllTorreIds() {
  const result = await pool.query('SELECT id FROM torres ORDER BY numero ASC');
  return result.rows.map((row) => row.id);
}

async function getVisibleTorreIds(req) {
  return isAdmin(req) ? findAllTorreIds() : getAuthorizedTorreIds(req);
}

module.exports = { getAuthorizedTorreIds, getVisibleTorreIds, isAdmin };
