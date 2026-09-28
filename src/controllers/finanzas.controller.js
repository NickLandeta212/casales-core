const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const finanzasModel = require('../models/finanzas.model');
const { getAuthorizedTorreIds } = require('../utils/torreAccess');
const { parsePositiveInteger } = require('../utils/validators');

function isAdmin(role) {
  return role === 'admin_general' || role === 'admin_conjunto';
}

function parsePayload(body) {
  const fecha = String(body.fecha || '');
  const concepto = String(body.concepto || '').trim().slice(0, 200);
  const valor = Number(body.valor);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    throw new HttpError(400, 'fecha debe tener formato YYYY-MM-DD');
  }

  if (!concepto) {
    throw new HttpError(400, 'concepto es requerido');
  }

  if (!['ingreso', 'gasto'].includes(body.tipo)) {
    throw new HttpError(400, 'tipo debe ser ingreso o gasto');
  }

  if (!Number.isFinite(valor) || valor <= 0) {
    throw new HttpError(400, 'valor debe ser mayor a cero');
  }

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
  const movimientos = isAdmin(req.user.role)
    ? await finanzasModel.findAll({ alcance: 'conjunto' })
    : await finanzasModel.findAll({ alcance: 'torre', torre_ids: await getAuthorizedTorreIds(req) });

  res.json(movimientos);
});

const create = asyncHandler(async (req, res) => {
  const payload = parsePayload(req.body);

  if (isAdmin(req.user.role)) {
    if (payload.alcance !== 'conjunto') {
      throw new HttpError(403, 'La administracion registra movimientos del conjunto');
    }
  } else if (payload.alcance !== 'torre' || !(await getAuthorizedTorreIds(req)).includes(payload.torre_id)) {
    throw new HttpError(403, 'Solo puedes registrar movimientos de tus torres');
  }

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
    throw new HttpError(409, 'Los movimientos generados por pagos aprobados no se pueden eliminar');
  }

  const permitido = isAdmin(req.user.role)
    ? movimiento.alcance === 'conjunto'
    : (await getAuthorizedTorreIds(req)).includes(movimiento.torre_id);

  if (!permitido) {
    throw new HttpError(403, 'No puedes eliminar este movimiento');
  }

  await finanzasModel.remove(id);
  res.locals.auditDetalle = `${movimiento.tipo} "${movimiento.concepto}" por $${Number(movimiento.valor).toFixed(2)}`;

  res.json({ message: 'Movimiento eliminado' });
});

module.exports = { list, create, remove };
