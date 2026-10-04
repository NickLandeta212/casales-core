const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const reservaModel = require('../models/reserva.model');
const comprobantesService = require('../services/comprobantes.service');
const { getAuthorizedTorreIds } = require('../utils/torreAccess');
const { parsePositiveInteger, parseMotivoRechazo } = require('../utils/validators');

function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function parseFecha(value) {
  const fecha = String(value || '');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(`${fecha}T00:00:00`))) {
    throw new HttpError(400, 'fecha debe tener formato YYYY-MM-DD');
  }

  if (fecha < todayIso()) {
    throw new HttpError(400, 'No se puede reservar una fecha pasada');
  }

  return fecha;
}

const list = asyncHandler(async (req, res) => {
  let reservas;

  if (req.user.role === 'admin_general' || req.user.role === 'admin_conjunto') {
    reservas = await reservaModel.findAll();
  } else if (req.user.role === 'tesorero') {
    reservas = await reservaModel.findAllByTorreIds(await getAuthorizedTorreIds(req));
  } else {
    reservas = await reservaModel.findAllByUsuarioId(req.user.sub);
  }

  res.json(reservas);
});

const create = asyncHandler(async (req, res) => {
  const departamentoId = parsePositiveInteger(req.body.departamento_id, 'departamento_id');
  const fecha = parseFecha(req.body.fecha);

  try {
    const reserva = await reservaModel.create({
      departamento_id: departamentoId,
      fecha,
      // "Comprobante:" lo escribe solo attachComprobante: de esa marca depende quien puede ver el archivo.
      observaciones: String(req.body.observaciones || '').replace(/comprobante\s*:/gi, 'comprobante ').trim().slice(0, 1000),
    });

    res.status(201).json(reserva);
  } catch (error) {
    if (error.code === '23505') {
      throw new HttpError(409, 'Ya existe una reserva para esa fecha');
    }

    throw error;
  }
});

// Aprobacion: se mantiene PUT /:id/estado { estado: 'reservado' } por compatibilidad con el frontend.
const updateEstado = asyncHandler(async (req, res) => {
  const reservaId = parsePositiveInteger(req.params.id, 'id');

  if (req.body.estado !== 'reservado') {
    throw new HttpError(400, 'Solo se puede cambiar el estado a reservado. Para rechazar usa /rechazar');
  }

  const reserva = await reservaModel.approve(reservaId);

  if (!reserva) {
    throw new HttpError(409, 'La reserva no existe o ya no esta en proceso');
  }

  res.locals.auditDetalle = `Reserva #${reserva.id} del ${reserva.fecha}`;

  res.json(reserva);
});

const reject = asyncHandler(async (req, res) => {
  const reserva = await reservaModel.reject(
    parsePositiveInteger(req.params.id, 'id'),
    parseMotivoRechazo(req.body.motivo)
  );

  if (!reserva) {
    throw new HttpError(409, 'La reserva no existe o ya fue rechazada');
  }

  res.locals.auditDetalle = `Reserva #${reserva.id}. Motivo: ${reserva.motivo_rechazo}`;

  res.json(reserva);
});

const uploadComprobante = asyncHandler(async (req, res) => {
  const reservaId = parsePositiveInteger(req.params.id, 'id de reserva');

  const reserva = await comprobantesService.withComprobante(
    () => comprobantesService.saveReservaComprobante(req.body.comprobante_base64, reservaId),
    async (comprobanteUrl) => {
      const updated = await reservaModel.attachComprobante(reservaId, comprobanteUrl);

      if (!updated) {
        throw new HttpError(409, 'La reserva no existe o ya tiene un comprobante registrado');
      }

      return updated;
    }
  );

  res.status(201).json({ message: 'Comprobante subido correctamente', reserva });
});

module.exports = { list, create, updateEstado, reject, uploadComprobante };
