const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const personaModel = require('../models/persona.model');
const { getAuthorizedTorreIds } = require('../utils/torreAccess');

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

async function ensurePersonaPermitida(req, personaId) {
  if (req.user.role === 'admin_general') {
    return;
  }

  const persona = await personaModel.findByIdForTorreIds(personaId, await getAuthorizedTorreIds(req));

  if (!persona) {
    throw new HttpError(404, 'Persona no encontrada');
  }
}

const updateMovilidad = asyncHandler(async (req, res) => {
  const personaId = Number(req.params.id);
  await ensurePersonaPermitida(req, personaId);

  const persona = await personaModel.updateMovilidad(personaId, {
    vehiculo: String(req.body.vehiculo || '').trim().slice(0, 120),
    parqueadero: String(req.body.parqueadero || '').trim().slice(0, 60),
  });

  if (!persona) {
    throw new HttpError(404, 'Persona no encontrada');
  }

  res.json(persona);
});

module.exports = { list, getById, create, update, remove, updateMovilidad };
