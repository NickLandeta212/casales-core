const jwt = require('jsonwebtoken');
const usuarioModel = require('../models/usuario.model');

const PASSWORD_CHANGE_PATHS = ['/api/v1/auth/me', '/api/v1/auth/change-password'];

// El JWT solo identifica al usuario; rol, torres y permisos se leen de la BD en cada peticion.
// Asi un cambio de rol, de torres o la eliminacion del usuario aplican de inmediato.
async function authenticateToken(req, res, next) {
  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ message: 'JWT_SECRET no configurado en el servidor' });
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token no proporcionado' });
  }

  let payload;

  try {
    payload = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
  } catch (error) {
    return res.status(401).json({ message: 'Token invalido o expirado' });
  }

  let user;

  try {
    user = await usuarioModel.findById(payload.sub);
  } catch (error) {
    return next(error);
  }

  if (!user) {
    return res.status(401).json({ message: 'La cuenta ya no existe' });
  }

  // Con contrasena temporal solo se permite consultar la sesion y cambiarla.
  if (user.must_change_password && !PASSWORD_CHANGE_PATHS.includes(req.originalUrl.split('?')[0])) {
    return res.status(403).json({ message: 'Debes cambiar tu contrasena temporal', code: 'PASSWORD_CHANGE_REQUIRED' });
  }

  req.user = {
    sub: user.id,
    nombre: user.nombre,
    email: user.email,
    role: user.role,
    page_permissions: Array.isArray(user.page_permissions) ? user.page_permissions : [],
    torre_ids: Array.isArray(user.torre_ids)
      ? user.torre_ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
      : [],
    must_change_password: Boolean(user.must_change_password),
  };

  return next();
}

function authorizeRoles(...allowedRoles) {
  const roles = allowedRoles.flat();

  return function roleGuard(req, res, next) {
    if (!req.user) {
      return res.status(401).json({ message: 'Usuario no autenticado' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'No tienes permisos para esta operacion' });
    }

    return next();
  };
}

module.exports = { authenticateToken, authorizeRoles };
