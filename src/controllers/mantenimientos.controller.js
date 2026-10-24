const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const mantenimientoModel = require('../models/mantenimiento.model');
const proveedorModel = require('../models/proveedor.model');
const { parsePositiveInteger, parseTexto, parseFecha, parseOpcion } = require('../utils/validators');

const FRECUENCIAS = ['unica', 'mensual', 'trimestral', 'semestral', 'anual'];
const DIAS_PROXIMOS = 30;

function parseCosto(value, fieldName) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const costo = Number(value);

  if (!Number.isFinite(costo) || costo < 0 || costo > 1000000) {
    throw new HttpError(400, `${fieldName} debe ser cero o mayor`);
  }

  return costo;
}

async function parseMantenimiento(body) {
  const diasAviso = Number(body.dias_aviso ?? 7);

  if (!Number.isInteger(diasAviso) || diasAviso < 0 || diasAviso > 60) {
    throw new HttpError(400, 'Los dias de aviso deben estar entre 0 y 60');
  }

  const proveedorId = body.proveedor_id ? parsePositiveInteger(body.proveedor_id, 'proveedor_id') : null;

  if (proveedorId && !(await proveedorModel.findProveedorById(proveedorId))) {
    throw new HttpError(400, 'Proveedor no encontrado');
  }

  return {
    titulo: parseTexto(body.titulo, 150, 'titulo', true),
    descripcion: parseTexto(body.descripcion, 1000, 'descripcion') || null,
    area: parseTexto(body.area, 100, 'area') || null,
    proveedor_id: proveedorId,
    costo_estimado: parseCosto(body.costo_estimado, 'costo_estimado'),
    frecuencia: parseOpcion(body.frecuencia, FRECUENCIAS, 'frecuencia'),
    proxima_fecha: parseFecha(body.proxima_fecha, 'proxima_fecha'),
    dias_aviso: diasAviso,
    activo: body.activo !== false,
  };
}

const list = asyncHandler(async (req, res) => {
  res.json(await mantenimientoModel.findAll());
});

// Para el inicio: atrasados y los de los proximos 30 dias.
const proximos = asyncHandler(async (req, res) => {
  res.json(await mantenimientoModel.findProximos(DIAS_PROXIMOS));
});

const ejecuciones = asyncHandler(async (req, res) => {
  res.json(await mantenimientoModel.findEjecuciones(parsePositiveInteger(req.params.id, 'id')));
});

const create = asyncHandler(async (req, res) => {
  const mantenimiento = await mantenimientoModel.create({ ...(await parseMantenimiento(req.body)), creado_por: req.user.sub });
  res.locals.auditDetalle = `Mantenimiento "${mantenimiento.titulo}" (${mantenimiento.frecuencia}) desde ${mantenimiento.proxima_fecha}`;
  res.status(201).json(mantenimiento);
});

const update = asyncHandler(async (req, res) => {
  const mantenimiento = await mantenimientoModel.update(parsePositiveInteger(req.params.id, 'id'), await parseMantenimiento(req.body));

  if (!mantenimiento) {
    throw new HttpError(404, 'Mantenimiento no encontrado');
  }

  res.locals.auditDetalle = `Mantenimiento "${mantenimiento.titulo}"${mantenimiento.activo ? '' : ' desactivado'}`;
  res.json(mantenimiento);
});

const realizar = asyncHandler(async (req, res) => {
  const fecha = parseFecha(req.body.fecha, 'fecha');

  if (fecha > new Date().toISOString().slice(0, 10)) {
    throw new HttpError(400, 'La fecha de realizacion no puede ser futura');
  }

  const mantenimiento = await mantenimientoModel.registrarEjecucion(parsePositiveInteger(req.params.id, 'id'), {
    fecha,
    observaciones: parseTexto(req.body.observaciones, 1000, 'observaciones') || null,
    costo: parseCosto(req.body.costo, 'costo'),
    user_id: req.user.sub,
  });

  res.locals.auditDetalle = `Mantenimiento "${mantenimiento.titulo}" realizado el ${fecha}`;
  res.json({
    message: mantenimiento.activo ? `Registrado. Próximo: ${mantenimiento.proxima_fecha}` : 'Registrado. Era de una sola vez, queda cerrado.',
    mantenimiento,
  });
});

module.exports = { list, proximos, ejecuciones, create, update, realizar };
