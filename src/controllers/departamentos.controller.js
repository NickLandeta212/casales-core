const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const departamentoModel = require('../models/departamento.model');
const torreModel = require('../models/torre.model');
const usuarioModel = require('../models/usuario.model');

function isTesoreroRole(role) {
  return role === 'condomino' || role === 'tesorero';
}

async function getAuthorizedTorreIds(req) {
  if (Array.isArray(req.user?.torre_ids)) {
    return req.user.torre_ids;
  }

  const user = await usuarioModel.findById(req.user.sub);
  return Array.isArray(user?.torre_ids) ? user.torre_ids : [];
}

function isSpecialDNumber(codigoNumero) {
  if (!/^[1-7][0-9]{2}$/.test(codigoNumero)) {
    return false;
  }

  const unit = Number(codigoNumero.slice(1));
  return unit >= 1 && unit <= 8;
}

async function validatePayload(body) {
  const { torre_id, codigo_tipo, codigo_numero } = body;

  if (torre_id === undefined || codigo_tipo === undefined || codigo_numero === undefined) {
    throw new HttpError(400, 'torre_id, codigo_tipo y codigo_numero son requeridos');
  }

  if (!Number.isInteger(Number(torre_id)) || Number(torre_id) <= 0) {
    throw new HttpError(400, 'torre_id debe ser un entero positivo');
  }

  if (!['D', 'PB', 'SS'].includes(String(codigo_tipo).toUpperCase())) {
    throw new HttpError(400, 'codigo_tipo debe ser D, PB o SS');
  }

  if (typeof codigo_numero !== 'string' || !codigo_numero.trim()) {
    throw new HttpError(400, 'codigo_numero es requerido');
  }

  if (!/^[0-9]+$/.test(codigo_numero.trim())) {
    throw new HttpError(400, 'codigo_numero debe contener solo numeros');
  }

  const torre = await torreModel.findById(Number(torre_id));

  if (!torre) {
    throw new HttpError(404, 'Torre no encontrada');
  }

  if (Number(torre.numero) >= 1 && Number(torre.numero) <= 4 && String(codigo_tipo).toUpperCase() === 'D' && !isSpecialDNumber(codigo_numero.trim())) {
    throw new HttpError(400, 'Para torres 1 a 4 con codigo D, el numero debe estar entre 101-108, 201-208, 301-308, 401-408, 501-508, 601-608 o 701-708');
  }
}

const list = asyncHandler(async (req, res) => {
  let departamentos;

  if (req.user?.role === 'admin_general') {
    departamentos = await departamentoModel.findAll();
  } else {
    const torreIds = await getAuthorizedTorreIds(req);
    departamentos = torreIds.length > 0
      ? await departamentoModel.findByTorreIds(torreIds)
      : isTesoreroRole(req.user?.role)
        ? await departamentoModel.findByUsuarioId(req.user.sub)
        : [];
  }

  res.json(departamentos);
});

const getById = asyncHandler(async (req, res) => {
  const requestedId = Number(req.params.id);
  let departamento;

  if (req.user?.role === 'admin_general') {
    departamento = await departamentoModel.findById(requestedId);
  } else {
    const torreIds = await getAuthorizedTorreIds(req);
    const rows = torreIds.length > 0
      ? await departamentoModel.findByTorreIds(torreIds)
      : isTesoreroRole(req.user?.role)
        ? await departamentoModel.findByUsuarioId(req.user.sub)
        : [];
    departamento = rows.find((row) => row.id === requestedId) || null;
  }

  if (!departamento) {
    throw new HttpError(404, 'Departamento no encontrado');
  }

  res.json(departamento);
});

const create = asyncHandler(async (req, res) => {
  await validatePayload(req.body);
  const departamento = await departamentoModel.create({
    torre_id: Number(req.body.torre_id),
    codigo_tipo: String(req.body.codigo_tipo).toUpperCase(),
    codigo_numero: req.body.codigo_numero.trim(),
    usuario_id: req.body.usuario_id ? Number(req.body.usuario_id) : null,
  });

  res.status(201).json(departamento);
});

const update = asyncHandler(async (req, res) => {
  await validatePayload(req.body);
  const departamento = await departamentoModel.update(Number(req.params.id), {
    torre_id: Number(req.body.torre_id),
    codigo_tipo: String(req.body.codigo_tipo).toUpperCase(),
    codigo_numero: req.body.codigo_numero.trim(),
    usuario_id: req.body.usuario_id ? Number(req.body.usuario_id) : null,
  });

  if (!departamento) {
    throw new HttpError(404, 'Departamento no encontrado');
  }

  res.json(departamento);
});

const remove = asyncHandler(async (req, res) => {
  const departamento = await departamentoModel.remove(Number(req.params.id));

  if (!departamento) {
    throw new HttpError(404, 'Departamento no encontrado');
  }

  res.json({ message: 'Departamento eliminado correctamente' });
});

module.exports = { list, getById, create, update, remove };
