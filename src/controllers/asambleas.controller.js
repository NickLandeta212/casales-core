const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const asambleaModel = require('../models/asamblea.model');
const asambleaPdf = require('../services/asamblea-pdf.service');
const avisosService = require('../services/avisos.service');
const { escapeHtml } = require('../services/correo.service');
const { formatFechaHora } = require('../services/pdf-base');
const { parsePositiveInteger, parseTexto, parseOpcion } = require('../utils/validators');

// Quienes reciben el aviso por correo: la gestion y los departamentos (no la guardia).
const ROLES_AVISO = ['admin_general', 'admin_conjunto', 'tesorero', 'condomino'];
const PUNTOS_MAX = 20;
// Ecuador continental no tiene horario de verano: la hora local siempre es UTC-5.
const OFFSET_CONJUNTO = '-05:00';

// La fecha llega del formulario como hora local (YYYY-MM-DDTHH:mm).
function parseFechaHora(value) {
  const texto = String(value || '').trim();

  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(texto)) {
    throw new HttpError(400, 'fecha_hora debe tener formato YYYY-MM-DDTHH:mm');
  }

  const fecha = new Date(`${texto}:00${OFFSET_CONJUNTO}`);

  if (Number.isNaN(fecha.getTime())) {
    throw new HttpError(400, 'fecha_hora no es valida');
  }

  if (fecha.getTime() < Date.now()) {
    throw new HttpError(400, 'La asamblea debe convocarse para una fecha futura');
  }

  return fecha.toISOString();
}

function parseOrdenDelDia(value) {
  const puntos = (Array.isArray(value) ? value : [])
    .map((punto) => String(punto || '').trim().slice(0, 300))
    .filter(Boolean);

  if (puntos.length === 0 || puntos.length > PUNTOS_MAX) {
    throw new HttpError(400, `El orden del dia debe tener entre 1 y ${PUNTOS_MAX} puntos`);
  }

  return puntos;
}

function textoConvocatoria(asamblea) {
  const puntos = asamblea.orden_del_dia.map((punto, i) => `${i + 1}. ${punto}`).join('\n');
  return `Se convoca a la asamblea ${asamblea.tipo} "${asamblea.titulo}".\n`
    + `Fecha y hora: ${formatFechaHora(asamblea.fecha_hora)}\nLugar: ${asamblea.lugar}\n\nOrden del dia:\n${puntos}`;
}

// El correo sale despues de responder: enviar a todos puede tardar y no debe bloquear a la administracion.
function enviarAvisoEnSegundoPlano(asamblea, { asunto, mensaje, adjuntarPdf }) {
  setImmediate(async () => {
    try {
      const attachments = adjuntarPdf
        ? [{ filename: `convocatoria-asamblea-${asamblea.id}.pdf`, content: await asambleaPdf.buildConvocatoriaPdf(asamblea) }]
        : undefined;
      const html = `<p>${escapeHtml(mensaje).replace(/\n/g, '<br>')}</p>`;
      const enviados = await avisosService.enviarAviso(ROLES_AVISO, { asunto, mensaje, html, attachments });
      await asambleaModel.registrarCorreosEnviados(asamblea.id, enviados);
    } catch (error) {
      console.error(`No se pudo enviar el aviso de la asamblea ${asamblea.id}:`, error.message);
    }
  });
}

const list = asyncHandler(async (req, res) => {
  res.json(await asambleaModel.findAll());
});

const create = asyncHandler(async (req, res) => {
  const datos = {
    titulo: parseTexto(req.body.titulo, 150, 'titulo', true),
    tipo: parseOpcion(req.body.tipo, ['ordinaria', 'extraordinaria'], 'tipo'),
    fecha_hora: parseFechaHora(req.body.fecha_hora),
    lugar: parseTexto(req.body.lugar, 150, 'lugar', true),
    orden_del_dia: parseOrdenDelDia(req.body.orden_del_dia),
    creado_por: req.user.sub,
  };
  const publicarComunicado = req.body.publicar_comunicado !== false;
  const enviarCorreo = req.body.enviar_correo !== false;
  const comunicado = publicarComunicado
    ? { titulo: `Convocatoria: ${datos.titulo}`.slice(0, 150), contenido: textoConvocatoria(datos) }
    : null;

  const asamblea = await asambleaModel.create(datos, comunicado);

  if (enviarCorreo) {
    enviarAvisoEnSegundoPlano(asamblea, {
      asunto: `Convocatoria a asamblea ${asamblea.tipo}: ${asamblea.titulo}`,
      mensaje: textoConvocatoria(asamblea),
      adjuntarPdf: true,
    });
  }

  res.locals.auditDetalle = `Asamblea "${asamblea.titulo}" convocada para ${formatFechaHora(asamblea.fecha_hora)}`;
  res.status(201).json({
    message: enviarCorreo ? 'Asamblea convocada. Los correos se estan enviando.' : 'Asamblea convocada.',
    asamblea,
  });
});

const cerrar = asyncHandler(async (req, res) => {
  const id = parsePositiveInteger(req.params.id, 'id');
  const estado = parseOpcion(req.body.estado, ['realizada', 'cancelada'], 'estado');
  const resultado = String(req.body.resultado || '').trim();

  if (resultado.length < 10 || resultado.length > 3000) {
    throw new HttpError(400, estado === 'cancelada'
      ? 'Indica el motivo de la cancelacion (entre 10 y 3000 caracteres)'
      : 'Resume lo resuelto en la asamblea (entre 10 y 3000 caracteres)');
  }

  const asamblea = await asambleaModel.cerrar(id, { estado, resultado });

  if (estado === 'cancelada' && req.body.enviar_correo !== false) {
    enviarAvisoEnSegundoPlano(asamblea, {
      asunto: `Asamblea cancelada: ${asamblea.titulo}`,
      mensaje: `La asamblea "${asamblea.titulo}" del ${formatFechaHora(asamblea.fecha_hora)} fue cancelada.\nMotivo: ${resultado}`,
      adjuntarPdf: false,
    });
  }

  res.locals.auditDetalle = `Asamblea "${asamblea.titulo}" ${estado}`;
  res.json({ message: `Asamblea marcada como ${estado}`, asamblea });
});

const convocatoria = asyncHandler(async (req, res) => {
  const asamblea = await asambleaModel.findById(parsePositiveInteger(req.params.id, 'id'));

  if (!asamblea) {
    throw new HttpError(404, 'Asamblea no encontrada');
  }

  const pdf = await asambleaPdf.buildConvocatoriaPdf(asamblea);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="convocatoria-asamblea-${asamblea.id}.pdf"`);
  res.send(pdf);
});

module.exports = { list, create, cerrar, convocatoria };
