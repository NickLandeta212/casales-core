const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const alicuotaModel = require('../models/alicuota.model');
const comprobantesService = require('../services/comprobantes.service');
const correoService = require('../services/correo.service');
const { getAuthorizedTorreIds, getVisibleTorreIds, isAdmin } = require('../utils/torreAccess');
const { parsePositiveInteger, parseMonto, parseAnio, parseMes, parseMotivoRechazo } = require('../utils/validators');

const VALOR_ALICUOTA_MAX = 100000;

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

// Pagos de departamentos: la administracion y el tesorero los consultan (cada uno con sus torres visibles),
// pero solo el tesorero de la torre los aprueba o rechaza.
function limitarATorres(ids, requestedTorreId = null) {
  if (requestedTorreId && !ids.includes(requestedTorreId)) {
    throw new HttpError(403, 'No tienes permisos sobre esta torre');
  }

  if (ids.length === 0) {
    return [-1];
  }

  return requestedTorreId ? [requestedTorreId] : ids;
}

async function torresParaConsultar(req, requestedTorreId = null) {
  return limitarATorres(await getVisibleTorreIds(req), requestedTorreId);
}

async function torresParaRevisar(req) {
  return limitarATorres(await getAuthorizedTorreIds(req));
}

const listMesesDepartamento = asyncHandler(async (req, res) => {
  const torreId = parsePositiveInteger(req.params.torreId, 'torreId');
  await torresParaConsultar(req, torreId);

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
  const pagos = await alicuotaModel.findPagos({ torre_ids: await torresParaConsultar(req, requestedTorreId) });

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
    torre_ids: await torresParaRevisar(req),
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
    torre_ids: await torresParaRevisar(req),
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
  const valor = parseMonto(req.body.valor, 'valor');

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

// Valor de la alicuota: la administracion define el general y el de cualquier torre;
// el tesorero solo el de sus torres (el general lo ve, pero no lo cambia).
async function assertPuedeEditarValor(req, torreId) {
  if (isAdmin(req)) {
    return;
  }

  if (!torreId || !(await getAuthorizedTorreIds(req)).includes(torreId)) {
    throw new HttpError(403, 'Solo puedes cambiar el valor de alicuota de tus torres');
  }
}

const listValores = asyncHandler(async (req, res) => {
  const valores = await alicuotaModel.findValores();

  if (isAdmin(req)) {
    return res.json(valores);
  }

  const torreIds = await getAuthorizedTorreIds(req);
  res.json(valores.filter((v) => v.torre_id === null || torreIds.includes(v.torre_id)));
});

const upsertValor = asyncHandler(async (req, res) => {
  const torreId = req.body.torre_id ? parsePositiveInteger(req.body.torre_id, 'torre_id') : null;
  const anio = parseAnio(req.body.anio, { requerido: true });
  const valor = parseMonto(req.body.valor, 'valor', VALOR_ALICUOTA_MAX);

  await assertPuedeEditarValor(req, torreId);

  const registro = await alicuotaModel.upsertValor({ torre_id: torreId, anio, valor, user_id: req.user.sub });
  res.locals.auditDetalle = `Valor ${valor.toFixed(2)} desde ${anio} para ${torreId ? `torre id ${torreId}` : 'todas las torres'}`;

  res.json(registro);
});

const removeValor = asyncHandler(async (req, res) => {
  const id = parsePositiveInteger(req.params.id, 'id');
  const existente = await alicuotaModel.findValorById(id);

  if (!existente) {
    throw new HttpError(404, 'Valor no encontrado');
  }

  await assertPuedeEditarValor(req, existente.torre_id);
  const registro = await alicuotaModel.removeValor(id);

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
