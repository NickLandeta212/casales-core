const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const reservaModel = require('../models/reserva.model');
const comprobantesService = require('../services/comprobantes.service');

const validStates = ['disponible', 'en_proceso', 'reservado'];

function isRestrictedResidentRole(role) {
  return role === 'condomino' || role === 'tesorero';
}

function validatePayload(body) {
  const { departamento_id, fecha, estado } = body;

  if (!departamento_id || !fecha) {
    throw new HttpError(400, 'departamento_id y fecha son requeridos');
  }

  if (!Number.isInteger(Number(departamento_id)) || Number(departamento_id) <= 0) {
    throw new HttpError(400, 'departamento_id debe ser un entero positivo');
  }

  if (estado && !validStates.includes(estado)) {
    throw new HttpError(400, 'estado debe ser disponible, en_proceso o reservado');
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha))) {
    throw new HttpError(400, 'fecha debe tener formato YYYY-MM-DD');
  }
}

function validateEstadoPayload(body) {
  const { estado } = body;

  if (!estado) {
    throw new HttpError(400, 'estado es requerido');
  }

  if (!validStates.includes(estado)) {
    throw new HttpError(400, 'estado debe ser disponible, en_proceso o reservado');
  }
}

const list = asyncHandler(async (req, res) => {
  const reservas = isRestrictedResidentRole(req.user?.role)
    ? await reservaModel.findAllByUsuarioId(req.user.sub)
    : await reservaModel.findAll();

  res.json(reservas);
});

const create = asyncHandler(async (req, res) => {
  validatePayload(req.body);

  try {
    const reserva = await reservaModel.create({
      departamento_id: Number(req.body.departamento_id),
      fecha: req.body.fecha,
      estado: req.body.estado || 'disponible',
      observaciones: req.body.observaciones,
    });

    res.status(201).json(reserva);
  } catch (error) {
    if (error.code === '23505') {
      throw new HttpError(409, 'Ya existe una reserva para esa fecha');
    }

    throw error;
  }
});

const updateEstado = asyncHandler(async (req, res) => {
  validateEstadoPayload(req.body);

  const reserva = await reservaModel.updateEstado(Number(req.params.id), req.body.estado);

  if (!reserva) {
    throw new HttpError(404, 'Reserva no encontrada');
  }

  res.json(reserva);
});

const uploadComprobante = asyncHandler(async (req, res) => {
  const reservaId = Number(req.params.id);

  if (!Number.isInteger(reservaId) || reservaId <= 0) {
    throw new HttpError(400, 'id de reserva invalido');
  }

  const comprobanteUrl = comprobantesService.saveReservaComprobante(req.body.comprobante_base64, reservaId);
  const reserva = await reservaModel.attachComprobante(reservaId, comprobanteUrl);

  if (!reserva) {
    throw new HttpError(404, 'Reserva no encontrada');
  }

  res.status(201).json({
    message: 'Comprobante subido correctamente',
    comprobante_url: comprobanteUrl,
    reserva,
  });
});

module.exports = { list, create, updateEstado, uploadComprobante };
