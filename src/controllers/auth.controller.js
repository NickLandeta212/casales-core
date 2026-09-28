const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const asyncHandler = require('../utils/asyncHandler');
const usuarioModel = require('../models/usuario.model');

function createAccessToken(user) {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET no configurado en el servidor');
  }

  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      page_permissions: user.page_permissions || [],
      torre_ids: user.torre_ids || [],
      must_change_password: Boolean(user.must_change_password),
    },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
}

function toSessionUser(user) {
  return {
    id: user.id,
    nombre: user.nombre,
    email: user.email,
    role: user.role,
    page_permissions: user.page_permissions || [],
    torre_ids: user.torre_ids || [],
    must_change_password: Boolean(user.must_change_password),
  };
}

const login = asyncHandler(async (req, res) => {
  const loginValue = String(req.body.username || req.body.login || '').trim();
  const password = String(req.body.password || '');

  if (!loginValue || !password) {
    return res.status(400).json({ message: 'usuario/apodo y password son requeridos' });
  }

  const user = await usuarioModel.findByLogin(loginValue);

  if (!user) {
    return res.status(401).json({ message: 'Credenciales invalidas' });
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);

  if (!passwordMatches) {
    return res.status(401).json({ message: 'Credenciales invalidas' });
  }

  const token = createAccessToken(user);
  res.locals.auditUsuario = user;

  return res.json({
    message: 'Login exitoso',
    token,
    user: toSessionUser(user),
  });
});

const me = asyncHandler(async (req, res) => {
  const user = await usuarioModel.findById(req.user.sub);

  if (!user) {
    return res.status(404).json({ message: 'Usuario no encontrado' });
  }

  return res.json({
    user: toSessionUser(user),
  });
});

const refresh = asyncHandler(async (req, res) => {
  const user = await usuarioModel.findById(req.user.sub);

  if (!user) {
    return res.status(404).json({ message: 'Usuario no encontrado' });
  }

  const token = createAccessToken(user);

  return res.json({
    message: 'Token renovado',
    token,
    user: toSessionUser(user),
  });
});

const changePassword = asyncHandler(async (req, res) => {
  const currentPassword = String(req.body.current_password || '');
  const newPassword = String(req.body.new_password || '');

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'current_password y new_password son requeridos' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ message: 'La nueva contrasena debe tener al menos 8 caracteres' });
  }

  if (newPassword === currentPassword) {
    return res.status(400).json({ message: 'La nueva contrasena debe ser distinta a la actual' });
  }

  const passwordHash = await usuarioModel.findPasswordHashById(req.user.sub);

  if (!passwordHash || !(await bcrypt.compare(currentPassword, passwordHash))) {
    return res.status(400).json({ message: 'La contrasena actual es incorrecta' });
  }

  await usuarioModel.updatePassword(req.user.sub, await bcrypt.hash(newPassword, 10), { mustChange: false });
  const user = await usuarioModel.findById(req.user.sub);

  // Se entrega un token nuevo porque el anterior quedo marcado con la contrasena temporal.
  return res.json({
    message: 'Contrasena actualizada correctamente',
    token: createAccessToken(user),
    user: toSessionUser(user),
  });
});

module.exports = { login, me, refresh, changePassword };
