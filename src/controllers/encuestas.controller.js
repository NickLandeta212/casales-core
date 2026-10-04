const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const encuestaModel = require('../models/encuesta.model');
const departamentoModel = require('../models/departamento.model');
const { parsePositiveInteger } = require('../utils/validators');

const TEXTO_MAX = 150;
const DESCRIPCION_MAX = 2000;
const OPCIONES_MIN = 2;
const OPCIONES_MAX = 10;

// El condomino no ve el conteo de una encuesta abierta hasta que su departamento vota,
// para que los resultados parciales no influyan en su voto.
function presentar(encuesta, user) {
  const ocultar = user.role === 'condomino' && encuesta.estado === 'abierta' && !encuesta.mi_voto;

  return {
    ...encuesta,
    resultados_visibles: !ocultar,
    total_votos: ocultar ? null : encuesta.total_votos,
    opciones: encuesta.opciones.map((opcion) => ({ ...opcion, votos: ocultar ? null : opcion.votos })),
  };
}

const list = asyncHandler(async (req, res) => {
  const encuestas = await encuestaModel.findAll(req.user.sub);

  res.json(encuestas.map((encuesta) => presentar(encuesta, req.user)));
});

const create = asyncHandler(async (req, res) => {
  const titulo = String(req.body.titulo || '').trim();
  const descripcion = String(req.body.descripcion || '').trim();
  const opciones = Array.isArray(req.body.opciones)
    ? req.body.opciones.map((opcion) => String(opcion || '').trim()).filter(Boolean)
    : [];

  if (titulo.length < 3 || titulo.length > TEXTO_MAX) {
    throw new HttpError(400, `titulo debe tener entre 3 y ${TEXTO_MAX} caracteres`);
  }

  if (descripcion.length > DESCRIPCION_MAX) {
    throw new HttpError(400, `descripcion no debe superar ${DESCRIPCION_MAX} caracteres`);
  }

  if (opciones.length < OPCIONES_MIN || opciones.length > OPCIONES_MAX) {
    throw new HttpError(400, `La encuesta debe tener entre ${OPCIONES_MIN} y ${OPCIONES_MAX} opciones`);
  }

  if (opciones.some((opcion) => opcion.length > TEXTO_MAX)) {
    throw new HttpError(400, `Cada opcion debe tener maximo ${TEXTO_MAX} caracteres`);
  }

  if (new Set(opciones.map((opcion) => opcion.toLowerCase())).size !== opciones.length) {
    throw new HttpError(400, 'Las opciones no pueden repetirse');
  }

  const encuesta = await encuestaModel.create({ titulo, descripcion, opciones, creado_por: req.user.sub });

  res.locals.auditDetalle = `Encuesta "${encuesta.titulo}" (${opciones.length} opciones)`;
  res.status(201).json(presentar(encuesta, req.user));
});

const cerrar = asyncHandler(async (req, res) => {
  const encuesta = await encuestaModel.cerrar(parsePositiveInteger(req.params.id, 'id'));

  if (!encuesta) {
    throw new HttpError(409, 'La encuesta no existe o ya esta cerrada');
  }

  res.locals.auditDetalle = `Encuesta "${encuesta.titulo}"`;
  res.json({ message: 'Encuesta cerrada' });
});

const remove = asyncHandler(async (req, res) => {
  const encuesta = await encuestaModel.remove(parsePositiveInteger(req.params.id, 'id'));

  if (!encuesta) {
    throw new HttpError(404, 'Encuesta no encontrada');
  }

  res.locals.auditDetalle = `Encuesta "${encuesta.titulo}"`;
  res.json({ message: 'Encuesta eliminada' });
});

// El departamento siempre sale de la sesion, nunca del cuerpo de la peticion.
const votar = asyncHandler(async (req, res) => {
  const encuestaId = parsePositiveInteger(req.params.id, 'id');
  const [departamento] = await departamentoModel.findByUsuarioId(req.user.sub);

  if (!departamento) {
    throw new HttpError(404, 'Tu cuenta no tiene un departamento asignado. Contacta a la administracion.');
  }

  const resultado = await encuestaModel.votar({
    encuesta_id: encuestaId,
    opcion_id: parsePositiveInteger(req.body.opcion_id, 'opcion_id'),
    departamento_id: departamento.id,
    usuario_id: req.user.sub,
  });

  if (resultado === 'cerrada') {
    throw new HttpError(409, 'La encuesta no existe o ya esta cerrada');
  }

  if (resultado === 'opcion') {
    throw new HttpError(400, 'La opcion no pertenece a esta encuesta');
  }

  if (resultado === 'repetido') {
    throw new HttpError(409, 'Tu departamento ya voto en esta encuesta');
  }

  // No se audita la opcion elegida: el voto es reservado.
  res.locals.auditDetalle = `Voto del departamento ${departamento.numero} en la encuesta #${encuestaId}`;
  res.status(201).json(presentar(await encuestaModel.findById(encuestaId, req.user.sub), req.user));
});

module.exports = { list, create, cerrar, remove, votar };
