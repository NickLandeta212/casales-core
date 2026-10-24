const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const solicitudModel = require('../models/solicitud.model');
const departamentoModel = require('../models/departamento.model');
const torreModel = require('../models/torre.model');
const comprobantesService = require('../services/comprobantes.service');
const { getAuthorizedTorreIds, isAdmin } = require('../utils/torreAccess');
const { parsePositiveInteger } = require('../utils/validators');

const TIPOS = ['mantenimiento', 'reclamo', 'sugerencia'];
const ESTADOS = ['recibida', 'en_proceso', 'resuelta'];
const ASUNTO_MAX = 150;
const TEXTO_MAX = 2000;
// Una foto de evidencia por solicitud; lo sucedido se explica en la descripcion.
const FOTOS_MAX = 1;

// Cada solicitud tiene un destino:
//   conjunto: areas comunales o todo el conjunto. La atiende la administracion.
//   torre: algo de una torre. La atiende el tesorero de esa torre.
// Que solicitudes ve cada rol:
//   condomino: las de su departamento.  guardia: las que envio.
//   tesorero: las dirigidas a sus torres y las que envio.  administracion: todas (atiende solo las del conjunto).
async function alcanceDe(req) {
  if (isAdmin(req)) {
    return {};
  }

  if (req.user.role === 'condomino') {
    return { departamento_de: req.user.sub, creado_por: req.user.sub };
  }

  if (req.user.role === 'tesorero') {
    return { torre_ids: await getAuthorizedTorreIds(req), creado_por: req.user.sub };
  }

  return { creado_por: req.user.sub };
}

async function puedeAtender(req, solicitud) {
  if (solicitud.alcance === 'conjunto') {
    return isAdmin(req);
  }

  return req.user.role === 'tesorero' && (await getAuthorizedTorreIds(req)).includes(solicitud.torre_id);
}

// A donde puede enviar cada rol. El condomino: a la administracion o a la tesoreria de su torre.
// La guardia: a la administracion o a cualquier torre. El tesorero: a la administracion
// (lo de su torre lo resuelve el mismo).
async function destinosDe(req, departamento) {
  const destinos = [{ alcance: 'conjunto', torre_id: null, torre_numero: null }];
  let torres = [];

  if (req.user.role === 'condomino' && departamento) {
    torres = [await torreModel.findById(departamento.torre_id)];
  } else if (req.user.role === 'guardia') {
    torres = await torreModel.findAll();
  }

  torres.filter(Boolean).forEach((torre) => {
    destinos.push({ alcance: 'torre', torre_id: torre.id, torre_numero: torre.numero });
  });

  return destinos;
}

async function departamentoDe(req) {
  if (req.user.role !== 'condomino') {
    return null;
  }

  const [departamento] = await departamentoModel.findByUsuarioId(req.user.sub);

  if (!departamento) {
    throw new HttpError(404, 'Tu cuenta no tiene un departamento asignado. Contacta a la administracion.');
  }

  return departamento;
}

async function conPermisos(req, solicitudes) {
  return Promise.all(solicitudes.map(async (solicitud) => ({ ...solicitud, puede_atender: await puedeAtender(req, solicitud) })));
}

function describir(solicitud) {
  const origen = solicitud.departamento_numero
    ? `del departamento ${solicitud.departamento_numero}`
    : `de ${solicitud.creado_por_nombre} (${solicitud.creado_por_role})`;
  const destino = solicitud.alcance === 'torre' ? `la Torre ${solicitud.torre_numero}` : 'la administracion';
  return `${origen} para ${destino}`;
}

const list = asyncHandler(async (req, res) => {
  res.json(await conPermisos(req, await solicitudModel.findAll(await alcanceDe(req))));
});

const destinos = asyncHandler(async (req, res) => {
  res.json(await destinosDe(req, await departamentoDe(req)));
});

// El departamento del condomino siempre sale de la sesion, nunca del cuerpo de la peticion,
// y el destino debe ser uno de los permitidos para su rol.
const create = asyncHandler(async (req, res) => {
  const departamento = await departamentoDe(req);
  const torreId = req.body.alcance === 'torre' ? Number(req.body.torre_id) : null;
  const destino = (await destinosDe(req, departamento))
    .find((opcion) => opcion.alcance === req.body.alcance && opcion.torre_id === torreId);

  if (!destino) {
    throw new HttpError(400, 'Elige a quien va dirigida la solicitud');
  }

  const asunto = String(req.body.asunto || '').trim();
  const descripcion = String(req.body.descripcion || '').trim();
  const fotosBase64 = Array.isArray(req.body.fotos_base64) ? req.body.fotos_base64 : [];

  if (!TIPOS.includes(req.body.tipo)) {
    throw new HttpError(400, `tipo debe ser uno de: ${TIPOS.join(', ')}`);
  }

  if (asunto.length < 3 || asunto.length > ASUNTO_MAX) {
    throw new HttpError(400, `asunto debe tener entre 3 y ${ASUNTO_MAX} caracteres`);
  }

  if (!descripcion || descripcion.length > TEXTO_MAX) {
    throw new HttpError(400, `descripcion es requerida y no debe superar ${TEXTO_MAX} caracteres`);
  }

  if (fotosBase64.length > FOTOS_MAX) {
    throw new HttpError(400, 'Adjunta solo una foto; explica lo sucedido en la descripcion');
  }

  const fotos = await comprobantesService.saveFotos(fotosBase64, 'solicitud');
  let solicitud;

  try {
    solicitud = await solicitudModel.create({
      alcance: destino.alcance,
      torre_id: destino.torre_id,
      departamento_id: departamento ? departamento.id : null,
      tipo: req.body.tipo,
      asunto,
      descripcion,
      fotos,
      creado_por: req.user.sub,
    });
  } catch (error) {
    await Promise.all(fotos.map((url) => comprobantesService.removeComprobante(url)));
    throw error;
  }

  res.locals.auditDetalle = `Solicitud #${solicitud.id} (${solicitud.tipo}) ${describir(solicitud)}${fotos.length ? ` con ${fotos.length} foto(s)` : ''}`;
  res.status(201).json({ ...solicitud, puede_atender: await puedeAtender(req, solicitud) });
});

const atender = asyncHandler(async (req, res) => {
  const solicitud = await solicitudModel.findById(parsePositiveInteger(req.params.id, 'id'));
  const respuesta = String(req.body.respuesta || '').trim();

  // Mismo 404 si no existe o si no le corresponde atenderla.
  if (!solicitud || !(await puedeAtender(req, solicitud))) {
    throw new HttpError(404, 'Solicitud no encontrada');
  }

  if (!ESTADOS.includes(req.body.estado)) {
    throw new HttpError(400, `estado debe ser uno de: ${ESTADOS.join(', ')}`);
  }

  if (respuesta.length > TEXTO_MAX) {
    throw new HttpError(400, `respuesta no debe superar ${TEXTO_MAX} caracteres`);
  }

  if (req.body.estado === 'resuelta' && !respuesta) {
    throw new HttpError(400, 'Escribe una respuesta antes de marcarla como resuelta');
  }

  const actualizada = await solicitudModel.atender(solicitud.id, {
    estado: req.body.estado,
    respuesta: respuesta || null,
    atendido_por: req.user.sub,
  });

  res.locals.auditDetalle = `Solicitud #${actualizada.id} -> ${actualizada.estado}`;
  res.json({ ...actualizada, puede_atender: true });
});

const enlaceFoto = asyncHandler(async (req, res) => {
  const archivo = comprobantesService.getFileName(req.params.archivo);

  if (!archivo || !(await solicitudModel.findByFoto(comprobantesService.toStoredPath(archivo), await alcanceDe(req)))) {
    throw new HttpError(404, 'Foto no encontrada');
  }

  res.json({ url: await comprobantesService.createSignedUrl(archivo) });
});

module.exports = { list, destinos, create, atender, enlaceFoto };
