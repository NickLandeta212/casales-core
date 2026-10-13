const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const accesoModel = require('../models/acceso.model');
const { parsePositiveInteger, parseTexto } = require('../utils/validators');

const list = asyncHandler(async (_req, res) => {
  res.json(await accesoModel.findRecientes());
});

const create = asyncHandler(async (req, res) => {
  const autorizacion = req.body.autorizacion || 'pendiente';

  if (!['pendiente', 'autorizado', 'rechazado'].includes(autorizacion)) {
    throw new HttpError(400, 'autorizacion invalida');
  }

  const registro = await accesoModel.create({
    torre: parseTexto(req.body.torre, 40, 'torre', true),
    departamento: parseTexto(req.body.departamento, 40, 'departamento', true),
    duenio_contactado: parseTexto(req.body.duenio_contactado, 120, 'duenio_contactado', true),
    visitante: parseTexto(req.body.visitante, 120, 'visitante', true),
    documento: parseTexto(req.body.documento, 40),
    placa_vehiculo: parseTexto(req.body.placa_vehiculo, 20),
    hora_ingreso_vehiculo: parseTexto(req.body.hora_ingreso_vehiculo, 10),
    autorizacion,
    observacion: parseTexto(req.body.observacion, 500),
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
