const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const alicuotaModel = require('../models/alicuota.model');
const comprobantesService = require('../services/comprobantes.service');
const correoService = require('../services/correo.service');
const { getAuthorizedTorreIds } = require('../utils/torreAccess');
const { parsePositiveInteger, parseMotivoRechazo } = require('../utils/validators');

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function parseMes(value) {
  const mes = parsePositiveInteger(value, 'mes');

  if (mes > 12) {
    throw new HttpError(400, 'mes debe estar entre 1 y 12');
  }

  return mes;
}

function parseAnio(value) {
  return value ? parsePositiveInteger(value, 'anio') : alicuotaModel.getCurrentYear();
}

// Los pagos de departamentos los revisa solo el tesorero de cada torre.
async function getAllowedTorreIds(req, requestedTorreId = null) {
  const ids = await getAuthorizedTorreIds(req);

  if (requestedTorreId && !ids.includes(requestedTorreId)) {
    throw new HttpError(403, 'No tienes permisos para revisar pagos de esta torre');
  }

  if (ids.length === 0) {
    return [-1];
  }

  return requestedTorreId ? [requestedTorreId] : ids;
}

const listMesesDepartamento = asyncHandler(async (req, res) => {
  const torreId = parsePositiveInteger(req.params.torreId, 'torreId');
  await getAllowedTorreIds(req, torreId);

  const pagos = await alicuotaModel.findMesesByDepartamento({
    torre_id: torreId,
    departamento_id: parsePositiveInteger(req.params.departamentoId, 'departamentoId'),
    anio: parseAnio(req.query.anio),
  });

  if (pagos.length === 0) {
    throw new HttpError(404, 'Departamento no encontrado para esta torre');
  }

  res.json(pagos);
});

const listPagos = asyncHandler(async (req, res) => {
  const requestedTorreId = req.query.torre_id ? parsePositiveInteger(req.query.torre_id, 'torre_id') : null;
  const pagos = await alicuotaModel.findPagos({ torre_ids: await getAllowedTorreIds(req, requestedTorreId) });

  res.json(pagos);
});

const approvePago = asyncHandler(async (req, res) => {
  const pagoId = parsePositiveInteger(req.params.id, 'id');
  const pagoParaFacturar = await alicuotaModel.findPagoById(pagoId);

  if (!pagoParaFacturar) {
    throw new HttpError(404, 'Pago de alicuota no encontrado');
  }

  let correo = null;

  // La factura se envia antes de confirmar: si el correo falla, el pago sigue en revision.
  const pago = await alicuotaModel.approvePago(pagoId, {
    user_id: req.user.sub,
    torre_ids: await getAllowedTorreIds(req),
    beforeCommit: async (aprobado) => {
      correo = await correoService.sendPagoAlicuotaFacturaEmail({
        pago: { ...pagoParaFacturar, ...aprobado },
      });
    },
  });

  res.locals.auditDetalle = `Alicuota ${pago.mes}/${pago.anio} del departamento ${pagoParaFacturar.departamento_numero}`;
  res.json({
    message: 'Pago de alicuota aprobado correctamente',
    pago,
    factura_enviada: true,
    correo,
  });
});

const rejectPago = asyncHandler(async (req, res) => {
  const pagoId = parsePositiveInteger(req.params.id, 'id');
  const motivo = parseMotivoRechazo(req.body.motivo);

  const pago = await alicuotaModel.rejectPago(pagoId, {
    user_id: req.user.sub,
    torre_ids: await getAllowedTorreIds(req),
    motivo,
  });

  const notificado = await correoService.notifyPagoRechazado({
    email_destinatario: pago.email_destinatario,
    concepto: `alicuota de ${MESES[pago.mes - 1]} ${pago.anio}`,
    motivo,
  });

  res.locals.auditDetalle = `Alicuota ${pago.mes}/${pago.anio} (pago #${pago.id}). Motivo: ${motivo}`;
  res.json({ message: 'Pago de alicuota rechazado', pago, notificado });
});

const listMesesTorre = asyncHandler(async (req, res) => {
  const torreId = parsePositiveInteger(req.params.torreId, 'torreId');
  const pagos = await alicuotaModel.findMesesByTorre({ torre_id: torreId, anio: parseAnio(req.query.anio) });

  if (pagos.length === 0) {
    throw new HttpError(404, 'Torre no encontrada');
  }

  res.json(pagos);
});

const createPagoTorre = asyncHandler(async (req, res) => {
  const torreId = parsePositiveInteger(req.body.torre_id, 'torre_id');
  const anio = parseAnio(req.body.anio);
  const mes = parseMes(req.body.mes);
  const valor = Number(req.body.valor);

  if (!Number.isFinite(valor) || valor <= 0) {
    throw new HttpError(400, 'valor debe ser mayor a cero');
  }

  if (req.user.role === 'tesorero' && !(await getAuthorizedTorreIds(req)).includes(torreId)) {
    throw new HttpError(403, 'No tienes permisos para registrar pagos de esta torre');
  }

  const pago = await comprobantesService.withComprobante(
    () => comprobantesService.savePagoAlicuotaComprobante(req.body.comprobante_base64, `torre-${torreId}`),
    async (comprobanteUrl) => {
      const created = await alicuotaModel.createPagoTorre({
        torre_id: torreId,
        anio,
        mes,
        valor,
        comprobante_url: comprobanteUrl,
        comprobante_nombre: String(req.body.comprobante_nombre || '').trim() || null,
      });

      if (!created) {
        throw new HttpError(404, 'Torre no encontrada');
      }

      return created;
    }
  );

  res.status(201).json({
    message: 'Pago de alicuota de torre registrado correctamente',
    pago,
  });
});

const listPagosTorres = asyncHandler(async (req, res) => {
  const requestedTorreId = req.query.torre_id ? parsePositiveInteger(req.query.torre_id, 'torre_id') : null;
  res.json(await alicuotaModel.findPagosTorres({ torre_id: requestedTorreId }));
});

const approvePagoTorre = asyncHandler(async (req, res) => {
  const pago = await alicuotaModel.approvePagoTorre(parsePositiveInteger(req.params.id, 'id'), {
    user_id: req.user.sub,
  });

  res.json({
    message: 'Pago de alicuota de torre aprobado correctamente',
    pago,
  });
});

const rejectPagoTorre = asyncHandler(async (req, res) => {
  const pago = await alicuotaModel.rejectPagoTorre(parsePositiveInteger(req.params.id, 'id'), {
    user_id: req.user.sub,
    motivo: parseMotivoRechazo(req.body.motivo),
  });

  res.json({ message: 'Pago de alicuota de torre rechazado', pago });
});

const listValores = asyncHandler(async (_req, res) => {
  res.json(await alicuotaModel.findValores());
});

const upsertValor = asyncHandler(async (req, res) => {
  const torreId = req.body.torre_id ? parsePositiveInteger(req.body.torre_id, 'torre_id') : null;
  const anio = parsePositiveInteger(req.body.anio, 'anio');
  const valor = Number(req.body.valor);

  if (anio < 2000 || anio > 2200) {
    throw new HttpError(400, 'anio fuera de rango');
  }

  if (!Number.isFinite(valor) || valor <= 0 || valor > 100000) {
    throw new HttpError(400, 'valor debe ser mayor a cero');
  }

  const registro = await alicuotaModel.upsertValor({ torre_id: torreId, anio, valor, user_id: req.user.sub });
  res.locals.auditDetalle = `Valor ${valor.toFixed(2)} desde ${anio} para ${torreId ? `torre id ${torreId}` : 'todas las torres'}`;

  res.json(registro);
});

const removeValor = asyncHandler(async (req, res) => {
  const registro = await alicuotaModel.removeValor(parsePositiveInteger(req.params.id, 'id'));

  if (!registro) {
    throw new HttpError(404, 'Valor no encontrado');
  }

  res.locals.auditDetalle = `Valor ${registro.valor} de ${registro.anio} eliminado`;
  res.json({ message: 'Valor eliminado' });
});

module.exports = {
  listValores,
  upsertValor,
  removeValor,
  listMesesDepartamento,
  listPagos,
  approvePago,
  rejectPago,
  listMesesTorre,
  createPagoTorre,
  listPagosTorres,
  approvePagoTorre,
  rejectPagoTorre,
};
