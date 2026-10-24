const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const finanzasModel = require('../models/finanzas.model');
const { filtroDeAlcance, assertPuedeGestionar } = require('../utils/alcanceFinanciero');
const { parsePositiveInteger, parseMonto, parseTexto, parseFecha } = require('../utils/validators');

function parsePayload(body) {
  const fecha = parseFecha(body.fecha, 'fecha');

  const concepto = parseTexto(body.concepto, 200, 'concepto', true);

  if (!['ingreso', 'gasto'].includes(body.tipo)) {
    throw new HttpError(400, 'tipo debe ser ingreso o gasto');
  }

  const valor = parseMonto(body.valor, 'valor');

  if (!['pendiente', 'pagado'].includes(body.estado)) {
    throw new HttpError(400, 'estado debe ser pendiente o pagado');
  }

  if (!['conjunto', 'torre'].includes(body.alcance)) {
    throw new HttpError(400, 'alcance debe ser conjunto o torre');
  }

  return {
    fecha,
    concepto,
    tipo: body.tipo,
    valor,
    estado: body.estado,
    alcance: body.alcance,
    torre_id: body.alcance === 'torre' ? parsePositiveInteger(body.torre_id, 'torre_id') : null,
  };
}

// Administracion ve solo las finanzas del conjunto; tesoreria solo las de sus torres
// (incluidos los pagos aprobados de sus departamentos).
const list = asyncHandler(async (req, res) => {
  res.json(await finanzasModel.findAll(await filtroDeAlcance(req)));
});

const create = asyncHandler(async (req, res) => {
  const payload = parsePayload(req.body);

  await assertPuedeGestionar(req, payload);

  const movimiento = await finanzasModel.create({ ...payload, creado_por: req.user.sub });
  res.locals.auditDetalle = `${payload.tipo} "${payload.concepto}" por $${payload.valor.toFixed(2)}`;

  res.status(201).json(movimiento);
});

const remove = asyncHandler(async (req, res) => {
  const id = parsePositiveInteger(req.params.id, 'id');
  const movimiento = await finanzasModel.findById(id);

  if (!movimiento) {
    throw new HttpError(404, 'Movimiento no encontrado');
  }

  if (movimiento.origen !== 'manual') {
    throw new HttpError(409, movimiento.origen === 'egreso'
      ? 'Este gasto viene de Egresos: anulalo desde ahi para conservar el motivo'
      : 'Los movimientos generados por pagos aprobados no se pueden eliminar');
  }

  await assertPuedeGestionar(req, movimiento);

  await finanzasModel.remove(id);
  res.locals.auditDetalle = `${movimiento.tipo} "${movimiento.concepto}" por $${Number(movimiento.valor).toFixed(2)}`;

  res.json({ message: 'Movimiento eliminado' });
});

module.exports = { list, create, remove };
