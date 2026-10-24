const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const documentoModel = require('../models/documento.model');
const comprobantesService = require('../services/comprobantes.service');
const { GESTION } = require('../config/permisos');
const { parsePositiveInteger, parseTexto, parseOpcion } = require('../utils/validators');

const CATEGORIAS = ['reglamento', 'acta', 'contrato', 'otro'];

// Los documentos "gestion" (p. ej. contratos) solo los ven administracion y tesoreria.
function soloPublicos(req) {
  return !GESTION.includes(req.user.role);
}

async function findVisible(req) {
  const documento = await documentoModel.findById(parsePositiveInteger(req.params.id, 'id'));

  if (!documento || (soloPublicos(req) && documento.visibilidad !== 'todos')) {
    throw new HttpError(404, 'Documento no encontrado');
  }

  return documento;
}

const list = asyncHandler(async (req, res) => {
  res.json(await documentoModel.findAll({ soloPublicos: soloPublicos(req) }));
});

const create = asyncHandler(async (req, res) => {
  const datos = {
    titulo: parseTexto(req.body.titulo, 150, 'titulo', true),
    categoria: parseOpcion(req.body.categoria, CATEGORIAS, 'categoria'),
    descripcion: parseTexto(req.body.descripcion, 500, 'descripcion') || null,
    visibilidad: parseOpcion(req.body.visibilidad || 'todos', ['todos', 'gestion'], 'visibilidad'),
    subido_por: req.user.sub,
  };

  const documento = await comprobantesService.withComprobante(
    () => comprobantesService.saveArchivo(req.body.archivo_base64, `documento-${datos.categoria}`, {
      tipos: comprobantesService.IMAGENES_O_PDF,
      nombre: 'documento',
    }),
    (archivo_url) => documentoModel.create({ ...datos, archivo_url })
  );

  res.locals.auditDetalle = `Documento "${documento.titulo}" (${documento.categoria})`;
  res.status(201).json(documento);
});

const remove = asyncHandler(async (req, res) => {
  const documento = await documentoModel.remove(parsePositiveInteger(req.params.id, 'id'));

  if (!documento) {
    throw new HttpError(404, 'Documento no encontrado');
  }

  await comprobantesService.removeComprobante(documento.archivo_url);
  res.locals.auditDetalle = `Documento "${documento.titulo}" (${documento.categoria})`;
  res.json({ message: 'Documento eliminado' });
});

const enlace = asyncHandler(async (req, res) => {
  const documento = await findVisible(req);
  const archivo = comprobantesService.getFileName(documento.archivo_url);

  if (!archivo) {
    throw new HttpError(404, 'El archivo del documento ya no esta disponible');
  }

  res.json({ url: await comprobantesService.createSignedUrl(archivo) });
});

module.exports = { list, create, remove, enlace };
