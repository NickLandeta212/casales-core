const HttpError = require('./httpError');
const { getAuthorizedTorreIds, isAdmin } = require('./torreAccess');

// Regla comun de finanzas, egresos y presupuesto:
//   - La administracion maneja las cuentas del CONJUNTO.
//   - Cada tesorero maneja las cuentas de SUS TORRES.

// Filtro para listar: { alcance: 'conjunto' } o { alcance: 'torre', torre_ids: [...] }.
async function filtroDeAlcance(req) {
  return isAdmin(req)
    ? { alcance: 'conjunto', torre_ids: null }
    : { alcance: 'torre', torre_ids: await getAuthorizedTorreIds(req) };
}

// Lanza 403 si el usuario no puede registrar o modificar algo con ese alcance y torre.
async function assertPuedeGestionar(req, { alcance, torre_id }) {
  if (isAdmin(req)) {
    if (alcance !== 'conjunto') {
      throw new HttpError(403, 'La administracion gestiona las cuentas del conjunto');
    }

    return;
  }

  if (alcance !== 'torre' || !(await getAuthorizedTorreIds(req)).includes(Number(torre_id))) {
    throw new HttpError(403, 'Solo puedes gestionar las cuentas de tus torres');
  }
}

module.exports = { filtroDeAlcance, assertPuedeGestionar };
