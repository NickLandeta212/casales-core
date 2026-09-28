const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const departamentoModel = require('../models/departamento.model');
const alicuotaModel = require('../models/alicuota.model');
const multaModel = require('../models/multa.model');
const comprobantesService = require('../services/comprobantes.service');
const facturaPdfService = require('../services/factura-pdf.service');
const { normalizeEmail, parsePositiveInteger } = require('../utils/validators');

// Portal del condomino: el departamento siempre sale de la sesion, nunca del cuerpo de la peticion.
async function getDepartamento(req) {
  const [departamento] = await departamentoModel.findByUsuarioId(req.user.sub);

  if (!departamento) {
    throw new HttpError(404, 'Tu cuenta no tiene un departamento asignado. Contacta a la administracion.');
  }

  return departamento;
}

function parseAnio(value) {
  const anio = value ? parsePositiveInteger(value, 'anio') : alicuotaModel.getCurrentYear();

  if (anio < 2000 || anio > 2200) {
    throw new HttpError(400, 'anio fuera de rango');
  }

  return anio;
}

function parseMeses(value) {
  const meses = Array.isArray(value)
    ? Array.from(new Set(value.map((mes) => Number(mes)))).sort((a, b) => a - b)
    : [];

  if (meses.length === 0) {
    throw new HttpError(400, 'Selecciona al menos un mes');
  }

  if (meses.some((mes) => !Number.isInteger(mes) || mes < 1 || mes > 12)) {
    throw new HttpError(400, 'Los meses deben estar entre 1 y 12');
  }

  return meses;
}

const estado = asyncHandler(async (req, res) => {
  const departamento = await getDepartamento(req);
  const anio = parseAnio(req.query.anio);

  const [alicuotas, multas, pagosMultas] = await Promise.all([
    alicuotaModel.findMesesByDepartamento({ torre_id: departamento.torre_id, departamento_id: departamento.id, anio }),
    multaModel.findAllByUsuarioId(req.user.sub),
    multaModel.findPagosByDepartamento(departamento.id),
  ]);

  // El resumen siempre refleja lo vencido del anio en curso, sin importar el anio que se consulta.
  const hoy = new Date();
  const anioActual = hoy.getFullYear();
  const mesesAnioActual = anio === anioActual
    ? alicuotas
    : await alicuotaModel.findMesesByDepartamento({ torre_id: departamento.torre_id, departamento_id: departamento.id, anio: anioActual });
  const alicuotasAdeudadas = mesesAnioActual
    .filter((mes) => mes.mes <= hoy.getMonth() + 1 && (mes.estado === 'pendiente' || mes.estado === 'rechazado'))
    .reduce((total, mes) => total + Number(mes.valor), 0);
  const multasAdeudadas = multas
    .filter((multa) => multa.estado === 'pendiente')
    .reduce((total, multa) => total + Number(multa.monto), 0);

  res.json({
    departamento: {
      id: departamento.id,
      numero: departamento.numero,
      torre_id: departamento.torre_id,
      torre_numero: departamento.torre_numero,
    },
    anio,
    alicuotas,
    multas: multas.map(({ persona_cedula, ...multa }) => multa),
    pagos_multas: pagosMultas,
    resumen: {
      anio: anioActual,
      alicuotas_adeudadas: alicuotasAdeudadas,
      multas_adeudadas: multasAdeudadas,
      total_adeudado: alicuotasAdeudadas + multasAdeudadas,
    },
  });
});

const pagarAlicuotas = asyncHandler(async (req, res) => {
  const departamento = await getDepartamento(req);
  const anio = parseAnio(req.body.anio);
  const meses = parseMeses(req.body.meses);
  const emailDestinatario = normalizeEmail(req.body.email_destinatario);

  const pagos = await comprobantesService.withComprobante(
    () => comprobantesService.savePagoAlicuotaComprobante(req.body.comprobante_base64, departamento.id),
    (comprobanteUrl) => alicuotaModel.createPagoMeses({
      departamento_id: departamento.id,
      anio,
      meses,
      comprobante_url: comprobanteUrl,
      comprobante_nombre: String(req.body.comprobante_nombre || '').trim().slice(0, 200) || null,
      email_destinatario: emailDestinatario,
    })
  );

  res.locals.auditDetalle = `Alicuotas ${meses.join(', ')}/${anio} del departamento ${departamento.numero}`;
  res.status(201).json({ message: 'Pago enviado. Queda en revision del tesorero de tu torre.', pagos });
});

const pagarMultas = asyncHandler(async (req, res) => {
  const departamento = await getDepartamento(req);
  const multaIds = Array.isArray(req.body.multa_ids)
    ? Array.from(new Set(req.body.multa_ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)))
    : [];
  const total = Number(req.body.total);
  const emailDestinatario = normalizeEmail(req.body.email_destinatario);

  if (multaIds.length === 0) {
    throw new HttpError(400, 'Selecciona al menos una multa');
  }

  if (!Number.isFinite(total) || total <= 0) {
    throw new HttpError(400, 'total debe ser mayor a cero');
  }

  const pago = await comprobantesService.withComprobante(
    () => comprobantesService.savePagoMultaComprobante(req.body.comprobante_base64, departamento.id),
    (comprobanteUrl) => multaModel.createPago({
      departamento_id: departamento.id,
      multa_ids: multaIds,
      total,
      comprobante_url: comprobanteUrl,
      email_destinatario: emailDestinatario,
    })
  );

  res.locals.auditDetalle = `Pago de multas #${pago.id} por $${Number(pago.total).toFixed(2)} (${departamento.numero})`;
  res.status(201).json({ message: 'Pago enviado. Queda en revision del tesorero de tu torre.', pago });
});

function enviarPdf(res, buffer, nombre) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${nombre}.pdf"`);
  res.send(buffer);
}

const facturaAlicuota = asyncHandler(async (req, res) => {
  const departamento = await getDepartamento(req);
  const pago = await alicuotaModel.findPagoByIdForDepartamento(parsePositiveInteger(req.params.id, 'id'), departamento.id);

  if (!pago || pago.estado !== 'aprobado') {
    throw new HttpError(404, 'Factura no disponible: el pago no existe o aun no fue aprobado');
  }

  enviarPdf(res, await facturaPdfService.buildAlicuotaFacturaPdf(pago), facturaPdfService.buildAlicuotaInvoiceNumber(pago));
});

const facturaMultas = asyncHandler(async (req, res) => {
  const departamento = await getDepartamento(req);
  const pago = await multaModel.findPagoById(parsePositiveInteger(req.params.id, 'id'));

  if (!pago || pago.departamento_id !== departamento.id || pago.estado !== 'aprobado') {
    throw new HttpError(404, 'Factura no disponible: el pago no existe o aun no fue aprobado');
  }

  enviarPdf(res, await facturaPdfService.buildMultaFacturaPdf(pago), facturaPdfService.buildMultaInvoiceNumber(pago));
});

module.exports = { estado, pagarAlicuotas, pagarMultas, facturaAlicuota, facturaMultas };
