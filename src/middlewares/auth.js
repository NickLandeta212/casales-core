const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ message: 'JWT_SECRET no configurado en el servidor' });
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token no proporcionado' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Token invalido o expirado' });
  }
}

function authorizeRoles(...allowedRoles) {
  return function roleGuard(req, res, next) {
    if (!req.user) {
      return res.status(401).json({ message: 'Usuario no autenticado' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'No tienes permisos para esta operacion' });
    }

    return next();
  };
}

module.exports = { authenticateToken, authorizeRoles };
