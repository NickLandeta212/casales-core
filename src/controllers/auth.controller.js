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
    },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
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

  return res.json({
    message: 'Login exitoso',
    token,
    user: {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      role: user.role,
    },
  });
});

const me = asyncHandler(async (req, res) => {
  const user = await usuarioModel.findById(req.user.sub);

  if (!user) {
    return res.status(404).json({ message: 'Usuario no encontrado' });
  }

  return res.json({
    user: {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      role: user.role,
    },
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
    user,
  });
});

module.exports = { login, me, refresh };
