const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const comunicadoModel = require('../models/comunicado.model');
const { parsePositiveInteger } = require('../utils/validators');

const TITULO_MAX = 150;
const CONTENIDO_MAX = 5000;
const LIMIT_MAX = 100;

function parsePayload(body) {
  const titulo = String(body.titulo || '').trim();
  const contenido = String(body.contenido || '').trim();

  if (titulo.length < 3 || titulo.length > TITULO_MAX) {
    throw new HttpError(400, `titulo debe tener entre 3 y ${TITULO_MAX} caracteres`);
  }

  if (!contenido || contenido.length > CONTENIDO_MAX) {
    throw new HttpError(400, `contenido es requerido y no debe superar ${CONTENIDO_MAX} caracteres`);
  }

  return { titulo, contenido, fijado: body.fijado === true };
}

const list = asyncHandler(async (req, res) => {
  const limit = req.query.limit ? Math.min(parsePositiveInteger(req.query.limit, 'limit'), LIMIT_MAX) : null;

  res.json(await comunicadoModel.findAll({ limit }));
});

const create = asyncHandler(async (req, res) => {
  const comunicado = await comunicadoModel.create({ ...parsePayload(req.body), creado_por: req.user.sub });

  res.locals.auditDetalle = `Comunicado "${comunicado.titulo}"`;
  res.status(201).json(comunicado);
});

const update = asyncHandler(async (req, res) => {
  const comunicado = await comunicadoModel.update(parsePositiveInteger(req.params.id, 'id'), parsePayload(req.body));

  if (!comunicado) {
    throw new HttpError(404, 'Comunicado no encontrado');
  }

  res.locals.auditDetalle = `Comunicado "${comunicado.titulo}"`;
  res.json(comunicado);
});

const remove = asyncHandler(async (req, res) => {
  const comunicado = await comunicadoModel.remove(parsePositiveInteger(req.params.id, 'id'));

  if (!comunicado) {
    throw new HttpError(404, 'Comunicado no encontrado');
  }

  res.locals.auditDetalle = `Comunicado "${comunicado.titulo}"`;
  res.json({ message: 'Comunicado eliminado' });
});

module.exports = { list, create, update, remove };
