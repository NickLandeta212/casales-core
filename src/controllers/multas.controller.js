const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const multaModel = require('../models/multa.model');
const { getAuthorizedTorreIds } = require('../utils/torreAccess');
const { parsePositiveInteger, parseMonto, parseMotivoRechazo } = require('../utils/validators');
const correoService = require('../services/correo.service');

function normalizePayload(body) {
  const payload = {
    departamento_id: Number(body.departamento_id),
    motivo_id: Number(body.motivo_id),
    persona_nombre: String(body.persona_nombre || '').trim(),
    persona_apellidos: String(body.persona_apellidos || '').trim(),
    persona_cedula: String(body.persona_cedula || '').trim(),
    descripcion: String(body.descripcion || '').trim(),
    aprobada: typeof body.aprobada === 'boolean' ? body.aprobada : false,
    fecha: body.fecha,
  };

  if (!payload.departamento_id || !payload.motivo_id || !payload.persona_nombre || !payload.persona_apellidos || !payload.persona_cedula || !payload.descripcion) {
    throw new HttpError(400, 'departamento_id, motivo_id, persona_nombre, persona_apellidos, persona_cedula, descripcion y monto son requeridos');
  }

  return { ...payload, monto: parseMonto(body.monto, 'monto') };
}

async function ensureDepartamentoPermitido(req, departamentoId) {
  if (req.user.role === 'admin_general') {
    return;
  }

  const autorizado = await multaModel.isDepartamentoInTorreIds(departamentoId, await getAuthorizedTorreIds(req));

  if (!autorizado) {
    throw new HttpError(403, 'No tienes permisos para gestionar multas en esta torre');
  }
}

async function ensureMultaPermitida(req, multaId) {
  if (req.user.role === 'admin_general') {
    return;
  }

  const multa = await multaModel.findByIdForTorreIds(multaId, await getAuthorizedTorreIds(req));

  if (!multa) {
    throw new HttpError(404, 'Multa no encontrada');
  }
}

// Los pagos de multas los revisa solo el tesorero de la torre del departamento.
async function findPagoAutorizado(req, pagoId) {
  const pago = await multaModel.findPagoByIdForTorreIds(pagoId, await getAuthorizedTorreIds(req));

  if (!pago) {
    throw new HttpError(404, 'Pago de multas no encontrado');
  }

  return pago;
}

const list = asyncHandler(async (req, res) => {
  let multas;

  if (req.user.role === 'admin_general') {
    multas = await multaModel.findAll();
  } else if (req.user.role === 'condomino') {
    multas = await multaModel.findAllByUsuarioId(req.user.sub);
  } else {
    multas = await multaModel.findAllByTorreIds(await getAuthorizedTorreIds(req));
  }

  res.json(multas);
});

const listMotivos = asyncHandler(async (_req, res) => {
  res.json(await multaModel.findMotivos());
});

const listPagos = asyncHandler(async (req, res) => {
  res.json(await multaModel.findPagosByTorreIds(await getAuthorizedTorreIds(req)));
});

const getById = asyncHandler(async (req, res) => {
  const multaId = parsePositiveInteger(req.params.id, 'id');
  let multa;

  if (req.user.role === 'admin_general') {
    multa = await multaModel.findById(multaId);
  } else if (req.user.role === 'condomino') {
    multa = await multaModel.findByIdForUsuario(multaId, req.user.sub);
  } else {
    multa = await multaModel.findByIdForTorreIds(multaId, await getAuthorizedTorreIds(req));
  }

  if (!multa) {
    throw new HttpError(404, 'Multa no encontrada');
  }

  res.json(multa);
});

const create = asyncHandler(async (req, res) => {
  const payload = normalizePayload(req.body);
  await ensureDepartamentoPermitido(req, payload.departamento_id);

  const multa = await multaModel.create(payload);
  res.locals.auditDetalle = `Multa #${multa.id} de $${payload.monto.toFixed(2)} al departamento ${multa.departamento_numero}`;
  res.status(201).json(multa);
});

const update = asyncHandler(async (req, res) => {
  const multaId = parsePositiveInteger(req.params.id, 'id');
  const payload = normalizePayload(req.body);

  await ensureMultaPermitida(req, multaId);
  await ensureDepartamentoPermitido(req, payload.departamento_id);

  const multa = await multaModel.update(multaId, payload);

  if (!multa) {
    throw new HttpError(404, 'Multa no encontrada');
  }

  res.json(multa);
});

const remove = asyncHandler(async (req, res) => {
  const multaId = parsePositiveInteger(req.params.id, 'id');
  await ensureMultaPermitida(req, multaId);

  const multa = await multaModel.remove(multaId);

  if (!multa) {
    throw new HttpError(404, 'Multa no encontrada');
  }

  res.locals.auditDetalle = `Multa #${multaId} de $${Number(multa.monto).toFixed(2)}`;
  res.json({ message: 'Multa eliminada correctamente' });
});

const approvePago = asyncHandler(async (req, res) => {
  const pagoId = parsePositiveInteger(req.params.id, 'id');
  const pagoParaFacturar = await findPagoAutorizado(req, pagoId);
  let correo = null;

  // La factura se envia antes de confirmar: si el correo falla, el pago sigue en proceso.
  const pago = await multaModel.approvePago(pagoId, {
    user_id: req.user.sub,
    beforeCommit: async () => {
      correo = await correoService.sendPagoMultaFacturaEmail({
        pago: { ...pagoParaFacturar, updated_at: new Date() },
      });
    },
  });

  res.locals.auditDetalle = `Pago de multas #${pagoId} por $${Number(pago.total).toFixed(2)} (dep. ${pago.departamento_numero})`;
  res.json({
    message: 'Pago de multas aprobado correctamente',
    pago,
    factura_enviada: true,
    correo,
  });
});

const rejectPago = asyncHandler(async (req, res) => {
  const pagoId = parsePositiveInteger(req.params.id, 'id');
  const motivo = parseMotivoRechazo(req.body.motivo);
  await findPagoAutorizado(req, pagoId);

  const pago = await multaModel.rejectPago(pagoId, { user_id: req.user.sub, motivo });
  const notificado = await correoService.notifyPagoRechazado({
    email_destinatario: pago.email_destinatario,
    concepto: `multas #${pago.id}`,
    motivo,
  });

  res.locals.auditDetalle = `Pago de multas #${pagoId}. Motivo: ${motivo}`;
  res.json({ message: 'Pago de multas rechazado', pago, notificado });
});

module.exports = { list, listMotivos, listPagos, getById, create, update, remove, approvePago, rejectPago };
