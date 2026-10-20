const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const departamentoModel = require('../models/departamento.model');
const estadoCuentaModel = require('../models/estado-cuenta.model');
const pdfService = require('../services/estado-cuenta-pdf.service');
const { getVisibleTorreIds } = require('../utils/torreAccess');
const { parseAnio, parsePositiveInteger } = require('../utils/validators');

// El estado de cuenta lo consultan la administracion (todas las torres) y el tesorero (sus torres).
async function getDepartamentoAutorizado(req) {
  const departamento = await departamentoModel.findById(parsePositiveInteger(req.params.id, 'id'));
  const torreIds = await getVisibleTorreIds(req);

  // Mismo 404 si no existe o si no es de una torre visible.
  if (!departamento || !torreIds.includes(Number(departamento.torre_id))) {
    throw new HttpError(404, 'Departamento no encontrado');
  }

  return departamento;
}

function enviarPdf(res, buffer, nombre) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${nombre}.pdf"`);
  res.send(buffer);
}

const estado = asyncHandler(async (req, res) => {
  const departamento = await getDepartamentoAutorizado(req);
  res.json(await estadoCuentaModel.build(departamento, parseAnio(req.query.anio)));
});

const estadoPdf = asyncHandler(async (req, res) => {
  const departamento = await getDepartamentoAutorizado(req);
  const anio = parseAnio(req.query.anio);
  const estadoCuenta = await estadoCuentaModel.build(departamento, anio);

  enviarPdf(res, await pdfService.buildEstadoCuentaPdf(estadoCuenta), `estado-cuenta-${departamento.numero}-${anio}`);
});

// Solo se emite si el departamento no debe nada y no tiene pagos en revision.
const emitirPazYSalvo = asyncHandler(async (req, res) => {
  const departamento = await getDepartamentoAutorizado(req);
  const { departamento: datos, resumen } = await estadoCuentaModel.build(departamento, new Date().getFullYear());

  if (resumen.total_adeudado > 0) {
    throw new HttpError(409, `No se puede emitir: el departamento adeuda $${resumen.total_adeudado.toFixed(2)}`);
  }

  if (resumen.pagos_en_revision > 0) {
    throw new HttpError(409, 'No se puede emitir: el departamento tiene pagos en revision. Revisalos primero.');
  }

  const certificado = await estadoCuentaModel.createCertificado({
    departamento_id: departamento.id,
    titular: datos.titular,
    user_id: req.user.sub,
  });

  res.locals.auditDetalle = `Paz y salvo ${pdfService.buildCertificadoNumero(certificado)} del departamento ${departamento.numero}`;
  enviarPdf(res, await pdfService.buildPazYSalvoPdf(certificado), pdfService.buildCertificadoNumero(certificado));
});

const listCertificados = asyncHandler(async (req, res) => {
  const departamentoId = req.query.departamento_id ? parsePositiveInteger(req.query.departamento_id, 'departamento_id') : null;
  const certificados = await estadoCuentaModel.findCertificados({
    torre_ids: await getVisibleTorreIds(req),
    departamento_id: departamentoId,
  });

  res.json(certificados.map((c) => ({ ...c, numero: pdfService.buildCertificadoNumero(c) })));
});

const certificadoPdf = asyncHandler(async (req, res) => {
  const certificado = await estadoCuentaModel.findCertificadoById(parsePositiveInteger(req.params.id, 'id'));
  const torreIds = await getVisibleTorreIds(req);

  if (!certificado || !torreIds.includes(Number(certificado.torre_id))) {
    throw new HttpError(404, 'Certificado no encontrado');
  }

  enviarPdf(res, await pdfService.buildPazYSalvoPdf(certificado), pdfService.buildCertificadoNumero(certificado));
});

module.exports = { estado, estadoPdf, emitirPazYSalvo, listCertificados, certificadoPdf };
