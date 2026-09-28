// Torres autorizadas del usuario autenticado. authenticateToken ya las leyo de la BD,
// por lo que un cambio de permisos aplica de inmediato y no hasta que expire el token.
async function getAuthorizedTorreIds(req) {
  return Array.isArray(req.user?.torre_ids) ? req.user.torre_ids : [];
}

module.exports = { getAuthorizedTorreIds };
