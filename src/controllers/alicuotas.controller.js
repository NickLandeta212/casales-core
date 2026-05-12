const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const alicuotaModel = require('../models/alicuota.model');
const comprobantesService = require('../services/comprobantes.service');

function parsePositiveInteger(value, fieldName) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new HttpError(400, `${fieldName} debe ser un entero positivo`);
  }

  return parsed;
}

function getAllowedTorreIds(user, requestedTorreId) {
  if (user.role === 'admin_general' || user.role === 'admin_conjunto') {
    return requestedTorreId ? [requestedTorreId] : [];
  }

  const ids = Array.isArray(user.torre_ids)
    ? user.torre_ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
    : [];

  if (requestedTorreId && !ids.includes(requestedTorreId)) {
    throw new HttpError(403, 'No tienes permisos para revisar pagos de esta torre');
  }

  if (ids.length === 0) {
    return [-1];
  }

  return requestedTorreId ? [requestedTorreId] : ids;
}

const listDepartamentos = asyncHandler(async (req, res) => {
  const torreId = parsePositiveInteger(req.params.torreId, 'torreId');
  const departamentos = await alicuotaModel.findDepartamentosByTorre(torreId);
  res.json(departamentos);
});

const listMesesDepartamento = asyncHandler(async (req, res) => {
  const torreId = parsePositiveInteger(req.params.torreId, 'torreId');
  const departamentoId = parsePositiveInteger(req.params.departamentoId, 'departamentoId');
  const anio = req.query.anio ? parsePositiveInteger(req.query.anio, 'anio') : alicuotaModel.getCurrentYear();

  const pagos = await alicuotaModel.findMesesByDepartamento({
    torre_id: torreId,
    departamento_id: departamentoId,
    anio,
  });

  if (pagos.length === 0) {
    throw new HttpError(404, 'Departamento no encontrado para esta torre');
  }

  res.json(pagos);
});

const createPago = asyncHandler(async (req, res) => {
  const torreId = parsePositiveInteger(req.body.torre_id, 'torre_id');
  const departamentoId = parsePositiveInteger(req.body.departamento_id, 'departamento_id');
  const anio = req.body.anio ? parsePositiveInteger(req.body.anio, 'anio') : alicuotaModel.getCurrentYear();
  const mes = parsePositiveInteger(req.body.mes, 'mes');

  if (mes < 1 || mes > 12) {
    throw new HttpError(400, 'mes debe estar entre 1 y 12');
  }

  const comprobanteUrl = comprobantesService.savePagoAlicuotaComprobante(req.body.comprobante_base64, departamentoId);
  const pago = await alicuotaModel.createPago({
    torre_id: torreId,
    departamento_id: departamentoId,
    anio,
    mes,
    comprobante_url: comprobanteUrl,
    comprobante_nombre: String(req.body.comprobante_nombre || '').trim() || null,
  });

  if (!pago) {
    throw new HttpError(404, 'Departamento no encontrado para esta torre');
  }

  res.status(201).json({
    message: 'Pago de alicuota registrado correctamente',
    pago,
  });
});

const listPagos = asyncHandler(async (req, res) => {
  const requestedTorreId = req.query.torre_id ? parsePositiveInteger(req.query.torre_id, 'torre_id') : null;
  const allowedTorreIds = getAllowedTorreIds(req.user, requestedTorreId);

  const pagos = await alicuotaModel.findPagos({
    torre_ids: allowedTorreIds,
    torre_id: requestedTorreId && allowedTorreIds.length === 0 ? requestedTorreId : null,
  });

  res.json(pagos);
});

const approvePago = asyncHandler(async (req, res) => {
  const allowedTorreIds = getAllowedTorreIds(req.user);
  const pago = await alicuotaModel.approvePago(parsePositiveInteger(req.params.id, 'id'), {
    user_id: req.user.sub,
    torre_ids: allowedTorreIds,
  });

  if (!pago) {
    throw new HttpError(404, 'Pago de alicuota no encontrado');
  }

  res.json({
    message: 'Pago de alicuota aprobado correctamente',
    pago,
  });
});

const listMesesTorre = asyncHandler(async (req, res) => {
  const torreId = parsePositiveInteger(req.params.torreId, 'torreId');
  const anio = req.query.anio ? parsePositiveInteger(req.query.anio, 'anio') : alicuotaModel.getCurrentYear();
  const pagos = await alicuotaModel.findMesesByTorre({ torre_id: torreId, anio });

  if (pagos.length === 0) {
    throw new HttpError(404, 'Torre no encontrada');
  }

  res.json(pagos);
});

const createPagoTorre = asyncHandler(async (req, res) => {
  const torreId = parsePositiveInteger(req.body.torre_id, 'torre_id');
  const anio = req.body.anio ? parsePositiveInteger(req.body.anio, 'anio') : alicuotaModel.getCurrentYear();
  const mes = parsePositiveInteger(req.body.mes, 'mes');
  const valor = Number(req.body.valor);

  if (mes < 1 || mes > 12) {
    throw new HttpError(400, 'mes debe estar entre 1 y 12');
  }

  if (!Number.isFinite(valor) || valor <= 0) {
    throw new HttpError(400, 'valor debe ser mayor a cero');
  }

  const comprobanteUrl = comprobantesService.savePagoAlicuotaComprobante(req.body.comprobante_base64, `torre-${torreId}`);
  const pago = await alicuotaModel.createPagoTorre({
    torre_id: torreId,
    anio,
    mes,
    valor,
    comprobante_url: comprobanteUrl,
    comprobante_nombre: String(req.body.comprobante_nombre || '').trim() || null,
  });

  if (!pago) {
    throw new HttpError(404, 'Torre no encontrada');
  }

  res.status(201).json({
    message: 'Pago de alicuota de torre registrado correctamente',
    pago,
  });
});

const listPagosTorres = asyncHandler(async (req, res) => {
  const requestedTorreId = req.query.torre_id ? parsePositiveInteger(req.query.torre_id, 'torre_id') : null;
  const pagos = await alicuotaModel.findPagosTorres({ torre_id: requestedTorreId });
  res.json(pagos);
});

const approvePagoTorre = asyncHandler(async (req, res) => {
  const pago = await alicuotaModel.approvePagoTorre(parsePositiveInteger(req.params.id, 'id'), {
    user_id: req.user.sub,
  });

  if (!pago) {
    throw new HttpError(404, 'Pago de alicuota de torre no encontrado');
  }

  res.json({
    message: 'Pago de alicuota de torre aprobado correctamente',
    pago,
  });
});

module.exports = {
  listDepartamentos,
  listMesesDepartamento,
  createPago,
  listPagos,
  approvePago,
  listMesesTorre,
  createPagoTorre,
  listPagosTorres,
  approvePagoTorre,
};
