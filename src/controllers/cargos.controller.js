const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const cargoModel = require('../models/cargo.model');
const correoService = require('../services/correo.service');
const { getAuthorizedTorreIds, getVisibleTorreIds, isAdmin } = require('../utils/torreAccess');
const { parseAnio, parseMes, parseMonto, parsePositiveInteger, parseTexto, parseMotivoRechazo } = require('../utils/validators');

const VALOR_CARGO_MAX = 100000;

// La administracion ve todas las emisiones; el tesorero, las de sus torres y las generales.
const listEmisiones = asyncHandler(async (req, res) => {
  const torreIds = isAdmin(req) ? null : await getAuthorizedTorreIds(req);
  res.json(await cargoModel.findEmisiones({ torre_ids: torreIds }));
});

const createEmision = asyncHandler(async (req, res) => {
  const anio = parseAnio(req.body.anio, { requerido: true });
  const mes = parseMes(req.body.mes);
  const concepto = parseTexto(req.body.concepto, 150, 'concepto', true);
  const valor = parseMonto(req.body.valor, 'valor', VALOR_CARGO_MAX);
  const torreId = req.body.torre_id ? parsePositiveInteger(req.body.torre_id, 'torre_id') : null;

  if (concepto.length < 3) {
    throw new HttpError(400, 'El concepto debe tener al menos 3 caracteres');
  }

  const emision = await cargoModel.createEmision({ anio, mes, concepto, valor, torre_id: torreId, user_id: req.user.sub });

  res.locals.auditDetalle = `Cargo "${concepto}" ${mes}/${anio} por $${valor.toFixed(2)} a ${emision.departamentos} departamento(s)`;
  res.status(201).json({ message: `Cargo emitido a ${emision.departamentos} departamento(s)`, emision });
});

const revertirEmision = asyncHandler(async (req, res) => {
  const id = parsePositiveInteger(req.params.id, 'id');
  const motivo = String(req.body.motivo || '').trim();

  if (motivo.length < 10 || motivo.length > 500) {
    throw new HttpError(400, 'Indica el motivo de la reversion (entre 10 y 500 caracteres)');
  }

  const emision = await cargoModel.revertirEmision(id, { user_id: req.user.sub, motivo });

  res.locals.auditDetalle = `Cargo "${emision.concepto}" ${emision.mes}/${emision.anio} revertido. Motivo: ${motivo}`;
  res.json({ message: 'Cargo revertido', emision });
});

// Pagos de cargos: la gestion los consulta; los aprueba o rechaza el tesorero de la torre del departamento.
const listPagos = asyncHandler(async (req, res) => {
  res.json(await cargoModel.findPagosByTorreIds(await getVisibleTorreIds(req)));
});

const approvePago = asyncHandler(async (req, res) => {
  const pago = await cargoModel.approvePago(parsePositiveInteger(req.params.id, 'id'), {
    user_id: req.user.sub,
    torre_ids: await getAuthorizedTorreIds(req),
  });

  res.locals.auditDetalle = `Pago de cargos #${pago.id} por $${Number(pago.total).toFixed(2)} (${pago.departamento_numero})`;
  res.json({ message: 'Pago de cargos aprobado', pago });
});

const rejectPago = asyncHandler(async (req, res) => {
  const motivo = parseMotivoRechazo(req.body.motivo);
  const pago = await cargoModel.rejectPago(parsePositiveInteger(req.params.id, 'id'), {
    user_id: req.user.sub,
    torre_ids: await getAuthorizedTorreIds(req),
    motivo,
  });

  const notificado = await correoService.notifyPagoRechazado({
    email_destinatario: pago.email_destinatario,
    concepto: 'cargos extraordinarios',
    motivo,
  });

  res.locals.auditDetalle = `Pago de cargos #${pago.id} (${pago.departamento_numero}). Motivo: ${motivo}`;
  res.json({ message: 'Pago de cargos rechazado', pago, notificado });
});

module.exports = { listEmisiones, createEmision, revertirEmision, listPagos, approvePago, rejectPago };
