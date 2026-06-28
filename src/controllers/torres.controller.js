const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const torreModel = require('../models/torre.model');

function validatePayload(body) {
  const { numero, total_departamentos } = body;

  if (numero === undefined || total_departamentos === undefined) {
    throw new HttpError(400, 'numero y total_departamentos son requeridos');
  }

  if (!Number.isInteger(Number(numero)) || Number(numero) <= 0) {
    throw new HttpError(400, 'numero debe ser un entero positivo');
  }

  if (!Number.isInteger(Number(total_departamentos)) || Number(total_departamentos) <= 0) {
    throw new HttpError(400, 'total_departamentos debe ser un entero positivo');
  }
}

const list = asyncHandler(async (req, res) => {
  const role = req.user?.role;
  const allowedTorreIds = Array.isArray(req.user?.torre_ids)
    ? req.user.torre_ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
    : [];

  const torres = role === 'admin_general' || role === 'admin_conjunto'
    ? await torreModel.findAll()
    : await torreModel.findByIds(allowedTorreIds);

  res.json(torres);
});

const getById = asyncHandler(async (req, res) => {
  const torreId = Number(req.params.id);
  const torre = await torreModel.findById(torreId);

  if (!torre) {
    throw new HttpError(404, 'Torre no encontrada');
  }

  const role = req.user?.role;
  const allowedTorreIds = Array.isArray(req.user?.torre_ids)
    ? req.user.torre_ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
    : [];

  if (role !== 'admin_general' && role !== 'admin_conjunto' && !allowedTorreIds.includes(torre.id)) {
    throw new HttpError(403, 'No tienes permisos para consultar esta torre');
  }

  res.json(torre);
});

const create = asyncHandler(async (req, res) => {
  validatePayload(req.body);
  const torre = await torreModel.create({
    numero: Number(req.body.numero),
    total_departamentos: Number(req.body.total_departamentos),
  });

  res.status(201).json(torre);
});

const update = asyncHandler(async (req, res) => {
  validatePayload(req.body);
  const torre = await torreModel.update(Number(req.params.id), {
    numero: Number(req.body.numero),
    total_departamentos: Number(req.body.total_departamentos),
  });

  if (!torre) {
    throw new HttpError(404, 'Torre no encontrada');
  }

  res.json(torre);
});

const remove = asyncHandler(async (req, res) => {
  const torre = await torreModel.remove(Number(req.params.id));

  if (!torre) {
    throw new HttpError(404, 'Torre no encontrada');
  }

  res.json({ message: 'Torre eliminada correctamente' });
});

module.exports = { list, getById, create, update, remove };
