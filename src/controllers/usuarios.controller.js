const bcrypt = require('bcryptjs');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const usuarioModel = require('../models/usuario.model');

const validRoles = ['admin_general', 'admin_conjunto', 'tesorero', 'condomino'];
const validPages = [
  'home',
  'torres',
  'pagos_alicuota',
  'departamentos',
  'reservas',
  'personas',
  'personas_crear',
  'multas',
  'multas_crear',
  'usuarios',
  'usuarios_crear',
];

function normalizeStringList(value, allowedValues, fieldName) {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new HttpError(400, `${fieldName} debe ser una lista`);
  }

  const normalized = Array.from(new Set(value.map((item) => String(item).trim()).filter(Boolean)));
  const invalid = normalized.find((item) => !allowedValues.includes(item));

  if (invalid) {
    throw new HttpError(400, `${fieldName} contiene un valor invalido: ${invalid}`);
  }

  return normalized;
}

function normalizeTorreIds(value, fallbackTorreId) {
  const raw = Array.isArray(value) ? value : [];
  const ids = raw
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0);

  if (fallbackTorreId !== undefined && fallbackTorreId !== null && fallbackTorreId !== '') {
    ids.push(Number(fallbackTorreId));
  }

  return Array.from(new Set(ids));
}

function validatePayload(body, isUpdate = false) {
  const { nombre, email, password, role, torre_id } = body;

  if (!isUpdate && (!nombre || !email || !password || !role || torre_id === undefined || torre_id === null || torre_id === '')) {
    throw new HttpError(400, 'nombre, email, password, role y torre_id son requeridos');
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

  if (torre_id !== undefined && torre_id !== null && torre_id !== '' && (!Number.isInteger(Number(torre_id)) || Number(torre_id) <= 0)) {
    throw new HttpError(400, 'torre_id debe ser un entero positivo');
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
  const page_permissions = normalizeStringList(req.body.page_permissions, validPages, 'page_permissions');
  const torre_ids = normalizeTorreIds(req.body.torre_ids, req.body.torre_id);

  const password_hash = await bcrypt.hash(req.body.password, 10);
  const user = await usuarioModel.create({
    nombre,
    email,
    password_hash,
    role: req.body.role,
    torre_id: Number(req.body.torre_id),
    page_permissions,
    torre_ids,
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
    page_permissions: req.body.page_permissions !== undefined
      ? normalizeStringList(req.body.page_permissions, validPages, 'page_permissions')
      : current.page_permissions,
    torre_ids: req.body.torre_ids !== undefined
      ? normalizeTorreIds(req.body.torre_ids)
      : current.torre_ids,
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
