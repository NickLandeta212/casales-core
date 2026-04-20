const bcrypt = require('bcryptjs');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const usuarioModel = require('../models/usuario.model');

const validRoles = ['admin_general', 'admin_conjunto', 'condomino'];

function validatePayload(body, isUpdate = false) {
  const { nombre, email, password, role } = body;

  if (!isUpdate && (!nombre || !email || !password || !role)) {
    throw new HttpError(400, 'nombre, usuario/apodo, password y role son requeridos');
  }

  if (nombre !== undefined && String(nombre).trim().length < 3) {
    throw new HttpError(400, 'nombre debe tener al menos 3 caracteres');
  }

  if (email !== undefined && String(email).trim().length < 3) {
    throw new HttpError(400, 'usuario/apodo debe tener al menos 3 caracteres');
  }

  if (password !== undefined && String(password).length < 8) {
    throw new HttpError(400, 'password debe tener al menos 8 caracteres');
  }

  if (role !== undefined && !validRoles.includes(role)) {
    throw new HttpError(400, 'role invalido');
  }
}

const list = asyncHandler(async (req, res) => {
  const users = await usuarioModel.findAll();
  res.json(users);
});

const getById = asyncHandler(async (req, res) => {
  const user = await usuarioModel.findById(Number(req.params.id));

  if (!user) {
    throw new HttpError(404, 'Usuario no encontrado');
  }

  res.json(user);
});

const create = asyncHandler(async (req, res) => {
  validatePayload(req.body);

  const nombre = String(req.body.nombre).trim();
  const email = String(req.body.email).trim().toLowerCase();

  const password_hash = await bcrypt.hash(req.body.password, 10);
  const user = await usuarioModel.create({
    nombre,
    email,
    password_hash,
    role: req.body.role,
  });

  res.status(201).json(user);
});

const update = asyncHandler(async (req, res) => {
  validatePayload(req.body, true);

  const current = await usuarioModel.findById(Number(req.params.id));

  if (!current) {
    throw new HttpError(404, 'Usuario no encontrado');
  }

  const payload = {
    nombre: req.body.nombre !== undefined ? String(req.body.nombre).trim() : current.nombre,
    email: req.body.email !== undefined ? String(req.body.email).trim().toLowerCase() : current.email,
    role: req.body.role ?? current.role,
  };

  if (req.body.password) {
    payload.password_hash = await bcrypt.hash(req.body.password, 10);
  }

  const user = await usuarioModel.update(Number(req.params.id), payload);
  res.json(user);
});

const remove = asyncHandler(async (req, res) => {
  if (req.user.sub === Number(req.params.id)) {
    throw new HttpError(400, 'No puedes eliminar tu propio usuario autenticado');
  }

  const user = await usuarioModel.remove(Number(req.params.id));

  if (!user) {
    throw new HttpError(404, 'Usuario no encontrado');
  }

  res.json({ message: 'Usuario eliminado correctamente' });
});

module.exports = { list, getById, create, update, remove };