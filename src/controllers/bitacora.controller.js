const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const novedadModel = require('../models/novedad-guardia.model');
const comprobantesService = require('../services/comprobantes.service');
const { parsePositiveInteger, parseTexto, parseOpcion, parseFecha } = require('../utils/validators');

const TIPOS = ['ronda', 'incidente', 'mantenimiento', 'entrega_turno', 'otro'];
// El frontend reduce las fotos antes de enviarlas; el limite de la peticion es 6MB en total.
const FOTOS_MAX = 4;

const list = asyncHandler(async (req, res) => {
  res.json(await novedadModel.findAll({
    desde: parseFecha(req.query.desde, 'desde', false),
    hasta: parseFecha(req.query.hasta, 'hasta', false),
    tipo: req.query.tipo ? parseOpcion(req.query.tipo, TIPOS, 'tipo') : null,
  }));
});

const create = asyncHandler(async (req, res) => {
  const descripcion = parseTexto(req.body.descripcion, 2000, 'descripcion', true);
  const fotosBase64 = Array.isArray(req.body.fotos_base64) ? req.body.fotos_base64 : [];

  if (descripcion.length < 5) {
    throw new HttpError(400, 'Describe la novedad (minimo 5 caracteres)');
  }

  if (fotosBase64.length > FOTOS_MAX) {
    throw new HttpError(400, `Puedes adjuntar hasta ${FOTOS_MAX} fotos`);
  }

  const datos = {
    tipo: parseOpcion(req.body.tipo, TIPOS, 'tipo'),
    descripcion,
    departamento_id: req.body.departamento_id ? parsePositiveInteger(req.body.departamento_id, 'departamento_id') : null,
    registrado_por: req.user.sub,
  };

  const fotos = await comprobantesService.saveFotos(fotosBase64, 'bitacora');
  let novedad;

  try {
    novedad = await novedadModel.create({ ...datos, fotos });
  } catch (error) {
    await Promise.all(fotos.map((url) => comprobantesService.removeComprobante(url)));
    throw error;
  }

  res.locals.auditDetalle = `Novedad ${novedad.tipo}${fotos.length ? ` con ${fotos.length} foto(s)` : ''}`;
  res.status(201).json(novedad);
});

const enlaceFoto = asyncHandler(async (req, res) => {
  const archivo = comprobantesService.getFileName(req.params.archivo);

  if (!archivo || !(await novedadModel.existeFoto(comprobantesService.toStoredPath(archivo)))) {
    throw new HttpError(404, 'Foto no encontrada');
  }

  res.json({ url: await comprobantesService.createSignedUrl(archivo) });
});

module.exports = { list, create, enlaceFoto };
