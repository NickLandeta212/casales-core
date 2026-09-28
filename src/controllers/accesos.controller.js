const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const accesoModel = require('../models/acceso.model');
const { parsePositiveInteger } = require('../utils/validators');

function texto(value, max, campo, requerido = false) {
  const limpio = String(value || '').trim().slice(0, max);

  if (requerido && !limpio) {
    throw new HttpError(400, `${campo} es requerido`);
  }

  return limpio;
}

const list = asyncHandler(async (_req, res) => {
  res.json(await accesoModel.findRecientes());
});

const create = asyncHandler(async (req, res) => {
  const autorizacion = req.body.autorizacion || 'pendiente';

  if (!['pendiente', 'autorizado', 'rechazado'].includes(autorizacion)) {
    throw new HttpError(400, 'autorizacion invalida');
  }

  const registro = await accesoModel.create({
    torre: texto(req.body.torre, 40, 'torre', true),
    departamento: texto(req.body.departamento, 40, 'departamento', true),
    duenio_contactado: texto(req.body.duenio_contactado, 120, 'duenio_contactado', true),
    visitante: texto(req.body.visitante, 120, 'visitante', true),
    documento: texto(req.body.documento, 40),
    placa_vehiculo: texto(req.body.placa_vehiculo, 20),
    hora_ingreso_vehiculo: texto(req.body.hora_ingreso_vehiculo, 10),
    autorizacion,
    observacion: texto(req.body.observacion, 500),
    registrado_por: req.user.sub,
  });

  res.locals.auditDetalle = `${registro.visitante} para ${registro.torre}/${registro.departamento} (${registro.estado})`;
  res.status(201).json(registro);
});

function cambiarEstado(accion) {
  return asyncHandler(async (req, res) => {
    const registro = await accesoModel.cambiarEstado(parsePositiveInteger(req.params.id, 'id'), accion);

    if (!registro) {
      throw new HttpError(409, 'El registro no existe o ya no admite esta accion');
    }

    res.locals.auditDetalle = `${registro.visitante} - ${registro.torre}/${registro.departamento}`;
    res.json(registro);
  });
}

module.exports = {
  list,
  create,
  autorizar: cambiarEstado('autorizar'),
  rechazar: cambiarEstado('rechazar'),
  salida: cambiarEstado('salida'),
};
