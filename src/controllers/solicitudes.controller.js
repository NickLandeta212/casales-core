const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const solicitudModel = require('../models/solicitud.model');
const departamentoModel = require('../models/departamento.model');
const { getAuthorizedTorreIds } = require('../utils/torreAccess');
const { parsePositiveInteger } = require('../utils/validators');

const TIPOS = ['mantenimiento', 'reclamo', 'sugerencia'];
const ESTADOS = ['recibida', 'en_proceso', 'resuelta'];
const ASUNTO_MAX = 150;
const TEXTO_MAX = 2000;

// El condomino ve las de su departamento, el tesorero las de sus torres y la administracion todas.
const list = asyncHandler(async (req, res) => {
  let solicitudes;

  if (req.user.role === 'condomino') {
    solicitudes = await solicitudModel.findAll({ usuario_id: req.user.sub });
  } else if (req.user.role === 'tesorero') {
    solicitudes = await solicitudModel.findAll({ torre_ids: await getAuthorizedTorreIds(req) });
  } else {
    solicitudes = await solicitudModel.findAll();
  }

  res.json(solicitudes);
});

// El departamento siempre sale de la sesion, nunca del cuerpo de la peticion.
const create = asyncHandler(async (req, res) => {
  const [departamento] = await departamentoModel.findByUsuarioId(req.user.sub);

  if (!departamento) {
    throw new HttpError(404, 'Tu cuenta no tiene un departamento asignado. Contacta a la administracion.');
  }

  const asunto = String(req.body.asunto || '').trim();
  const descripcion = String(req.body.descripcion || '').trim();

  if (!TIPOS.includes(req.body.tipo)) {
    throw new HttpError(400, `tipo debe ser uno de: ${TIPOS.join(', ')}`);
  }

  if (asunto.length < 3 || asunto.length > ASUNTO_MAX) {
    throw new HttpError(400, `asunto debe tener entre 3 y ${ASUNTO_MAX} caracteres`);
  }

  if (!descripcion || descripcion.length > TEXTO_MAX) {
    throw new HttpError(400, `descripcion es requerida y no debe superar ${TEXTO_MAX} caracteres`);
  }

  const solicitud = await solicitudModel.create({
    departamento_id: departamento.id,
    tipo: req.body.tipo,
    asunto,
    descripcion,
    creado_por: req.user.sub,
  });

  res.locals.auditDetalle = `Solicitud #${solicitud.id} (${solicitud.tipo}) del departamento ${solicitud.departamento_numero}`;
  res.status(201).json(solicitud);
});

const atender = asyncHandler(async (req, res) => {
  const solicitud = await solicitudModel.findById(parsePositiveInteger(req.params.id, 'id'));
  const respuesta = String(req.body.respuesta || '').trim();

  // Mismo 404 si no existe o si es de otra torre.
  if (!solicitud || (req.user.role === 'tesorero' && !(await getAuthorizedTorreIds(req)).includes(solicitud.torre_id))) {
    throw new HttpError(404, 'Solicitud no encontrada');
  }

  if (!ESTADOS.includes(req.body.estado)) {
    throw new HttpError(400, `estado debe ser uno de: ${ESTADOS.join(', ')}`);
  }

  if (respuesta.length > TEXTO_MAX) {
    throw new HttpError(400, `respuesta no debe superar ${TEXTO_MAX} caracteres`);
  }

  if (req.body.estado === 'resuelta' && !respuesta) {
    throw new HttpError(400, 'Escribe una respuesta para el residente antes de marcarla como resuelta');
  }

  const actualizada = await solicitudModel.atender(solicitud.id, {
    estado: req.body.estado,
    respuesta: respuesta || null,
    atendido_por: req.user.sub,
  });

  res.locals.auditDetalle = `Solicitud #${actualizada.id} -> ${actualizada.estado}`;
  res.json(actualizada);
});

module.exports = { list, create, atender };
