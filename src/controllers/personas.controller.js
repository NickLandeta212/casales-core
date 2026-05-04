const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const personaModel = require('../models/persona.model');
const usuarioModel = require('../models/usuario.model');

async function getAuthorizedTorreIds(req) {
  if (Array.isArray(req.user?.torre_ids)) {
    return req.user.torre_ids;
  }

  const user = await usuarioModel.findById(req.user.sub);
  return Array.isArray(user?.torre_ids) ? user.torre_ids : [];
}

function validatePayload(body) {
  const { departamento_id, nombres, apellidos, documento } = body;

  if (!departamento_id || !nombres || !apellidos || !documento) {
    throw new HttpError(400, 'departamento_id, nombres, apellidos y documento son requeridos');
  }
}

const list = asyncHandler(async (req, res) => {
  const personas = req.user.role === 'admin_general'
    ? await personaModel.findAll()
    : await personaModel.findAllByTorreIds(await getAuthorizedTorreIds(req));
  res.json(personas);
});

const getById = asyncHandler(async (req, res) => {
  const persona = req.user.role === 'admin_general'
    ? await personaModel.findById(Number(req.params.id))
    : await personaModel.findByIdForTorreIds(Number(req.params.id), await getAuthorizedTorreIds(req));

  if (!persona) {
    throw new HttpError(404, 'Persona no encontrada');
  }

  res.json(persona);
});

const create = asyncHandler(async (req, res) => {
  validatePayload(req.body);

  if (req.user.role !== 'admin_general') {
    const isOwner = await personaModel.isDepartamentoInTorreIds(Number(req.body.departamento_id), await getAuthorizedTorreIds(req));

    if (!isOwner) {
      throw new HttpError(403, 'No puedes registrar personas en un departamento fuera de tus torres autorizadas');
    }
  }

  const persona = await personaModel.create({
    departamento_id: Number(req.body.departamento_id),
    nombres: req.body.nombres,
    apellidos: req.body.apellidos,
    documento: req.body.documento,
    telefono: req.body.telefono,
    tipo_ocupacion: req.body.tipo_ocupacion || 'dueno',
  });

  res.status(201).json(persona);
});

const update = asyncHandler(async (req, res) => {
  validatePayload(req.body);

  if (req.user.role !== 'admin_general') {
    const torreIds = await getAuthorizedTorreIds(req);
    const targetPersona = await personaModel.findByIdForTorreIds(Number(req.params.id), torreIds);

    if (!targetPersona) {
      throw new HttpError(404, 'Persona no encontrada');
    }

    const isOwner = await personaModel.isDepartamentoInTorreIds(Number(req.body.departamento_id), torreIds);

    if (!isOwner) {
      throw new HttpError(403, 'No puedes mover personas a un departamento fuera de tus torres autorizadas');
    }
  }

  const persona = await personaModel.update(Number(req.params.id), {
    departamento_id: Number(req.body.departamento_id),
    nombres: req.body.nombres,
    apellidos: req.body.apellidos,
    documento: req.body.documento,
    telefono: req.body.telefono,
    tipo_ocupacion: req.body.tipo_ocupacion || 'dueno',
  });

  if (!persona) {
    throw new HttpError(404, 'Persona no encontrada');
  }

  res.json(persona);
});

const remove = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin_general') {
    const targetPersona = await personaModel.findByIdForTorreIds(Number(req.params.id), await getAuthorizedTorreIds(req));

    if (!targetPersona) {
      throw new HttpError(404, 'Persona no encontrada');
    }
  }

  const persona = await personaModel.remove(Number(req.params.id));

  if (!persona) {
    throw new HttpError(404, 'Persona no encontrada');
  }

  res.json({ message: 'Persona eliminada correctamente' });
});

module.exports = { list, getById, create, update, remove };
