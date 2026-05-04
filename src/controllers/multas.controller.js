const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const multaModel = require('../models/multa.model');
const comprobantesService = require('../services/comprobantes.service');

function validatePayload(body) {
  const { departamento_id, motivo_id, persona_nombre, persona_apellidos, persona_cedula, descripcion, monto } = body;

  if (!departamento_id || !motivo_id || !persona_nombre || !persona_apellidos || !persona_cedula || !descripcion || monto === undefined || monto === null || monto === '') {
    throw new HttpError(400, 'departamento_id, motivo_id, persona_nombre, persona_apellidos, persona_cedula, descripcion y monto son requeridos');
  }
}

function normalizePayload(body) {
  return {
    departamento_id: Number(body.departamento_id),
    motivo_id: Number(body.motivo_id),
    persona_nombre: String(body.persona_nombre || '').trim(),
    persona_apellidos: String(body.persona_apellidos || '').trim(),
    persona_cedula: String(body.persona_cedula || '').trim(),
    descripcion: String(body.descripcion || '').trim(),
    monto: Number(body.monto),
    aprobada: typeof body.aprobada === 'boolean' ? body.aprobada : false,
    fecha: body.fecha,
  };
}

const list = asyncHandler(async (req, res) => {
  const multas = req.user.role === 'condomino'
    ? await multaModel.findAllByUsuarioId(req.user.sub)
    : await multaModel.findAll();

  res.json(multas);
});

const listMotivos = asyncHandler(async (_req, res) => {
  const motivos = await multaModel.findMotivos();
  res.json(motivos);
});

const listPagos = asyncHandler(async (_req, res) => {
  const pagos = await multaModel.findPagos();
  res.json(pagos);
});

const getById = asyncHandler(async (req, res) => {
  const multa = req.user.role === 'condomino'
    ? await multaModel.findByIdForUsuario(Number(req.params.id), req.user.sub)
    : await multaModel.findById(Number(req.params.id));

  if (!multa) {
    throw new HttpError(404, 'Multa no encontrada');
  }

  res.json(multa);
});

const create = asyncHandler(async (req, res) => {
  validatePayload(req.body);
  const payload = normalizePayload(req.body);

  if (req.user.role === 'condomino') {
    const isOwner = await multaModel.isDepartamentoOwnedByUsuario(payload.departamento_id, req.user.sub);

    if (!isOwner) {
      throw new HttpError(403, 'No puedes registrar multas en un departamento que no te pertenece');
    }
  }

  const multa = await multaModel.create(payload);

  res.status(201).json(multa);
});

const update = asyncHandler(async (req, res) => {
  validatePayload(req.body);
  const payload = normalizePayload(req.body);

  if (req.user.role === 'condomino') {
    const targetMulta = await multaModel.findByIdForUsuario(Number(req.params.id), req.user.sub);

    if (!targetMulta) {
      throw new HttpError(404, 'Multa no encontrada');
    }

    const isOwner = await multaModel.isDepartamentoOwnedByUsuario(payload.departamento_id, req.user.sub);

    if (!isOwner) {
      throw new HttpError(403, 'No puedes mover multas a un departamento que no te pertenece');
    }
  }

  const multa = await multaModel.update(Number(req.params.id), payload);

  if (!multa) {
    throw new HttpError(404, 'Multa no encontrada');
  }

  res.json(multa);
});

const remove = asyncHandler(async (req, res) => {
  if (req.user.role === 'condomino') {
    const targetMulta = await multaModel.findByIdForUsuario(Number(req.params.id), req.user.sub);

    if (!targetMulta) {
      throw new HttpError(404, 'Multa no encontrada');
    }
  }

  const multa = await multaModel.remove(Number(req.params.id));

  if (!multa) {
    throw new HttpError(404, 'Multa no encontrada');
  }

  res.json({ message: 'Multa eliminada correctamente' });
});

const createPago = asyncHandler(async (req, res) => {
  const departamentoId = Number(req.body.departamento_id);
  const multaIds = Array.isArray(req.body.multa_ids)
    ? req.body.multa_ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
    : [];
  const total = Number(req.body.total);

  if (!Number.isInteger(departamentoId) || departamentoId <= 0) {
    throw new HttpError(400, 'departamento_id debe ser un entero positivo');
  }

  if (multaIds.length === 0) {
    throw new HttpError(400, 'multa_ids debe incluir al menos una multa');
  }

  if (!Number.isFinite(total) || total <= 0) {
    throw new HttpError(400, 'total debe ser mayor a cero');
  }

  const comprobanteUrl = comprobantesService.savePagoMultaComprobante(req.body.comprobante_base64, departamentoId);
  const pago = await multaModel.createPago({
    departamento_id: departamentoId,
    multa_ids: multaIds,
    total,
    comprobante_url: comprobanteUrl,
  });

  res.status(201).json({
    message: 'Pago de multas registrado correctamente',
    comprobante_url: comprobanteUrl,
    pago,
  });
});

const approvePago = asyncHandler(async (req, res) => {
  const pago = await multaModel.approvePago(Number(req.params.id));

  if (!pago) {
    throw new HttpError(404, 'Pago de multas no encontrado');
  }

  res.json({
    message: 'Pago de multas aprobado correctamente',
    pago,
  });
});

module.exports = { list, listMotivos, listPagos, getById, create, update, remove, createPago, approvePago };
