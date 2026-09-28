const rateLimit = require('express-rate-limit');

// Formularios publicos (pagos, reservas, comprobantes): evita spam y llenado de disco.
const publicWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Demasiados envios desde esta conexion, intenta mas tarde' },
});

// Lecturas publicas: margen amplio para uso normal, pero limita el recorrido masivo de departamentos.
const publicReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Demasiadas consultas desde esta conexion, intenta mas tarde' },
});

// Login y cambio de contrasena: solo cuentan los intentos fallidos, para frenar ataques
// de fuerza bruta sin bloquear a quien usa la app con normalidad.
const credentialsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Demasiados intentos fallidos, intenta en 15 minutos' },
});

// Pagos desde el portal: el usuario ya esta autenticado, asi que el limite es por cuenta y no por IP
// (varios residentes pueden compartir red sin bloquearse entre si). Debe montarse despues de authenticateToken.
const portalWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => `usuario-${req.user.sub}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Demasiados envios desde tu cuenta, intenta mas tarde' },
});

module.exports = { publicWriteLimiter, publicReadLimiter, credentialsLimiter, portalWriteLimiter };
