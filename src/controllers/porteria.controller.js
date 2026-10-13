const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const porteriaModel = require('../models/porteria.model');
const departamentoModel = require('../models/departamento.model');
const { getDepartamento } = require('../utils/departamentoAccess');
const { parsePositiveInteger, parseTexto } = require('../utils/validators');

const DIAS_ANTICIPACION_MAX = 30;

const esResidente = (req) => req.user.role === 'condomino';

const listDepartamentos = asyncHandler(async (_req, res) => {
  res.json(await porteriaModel.findDepartamentos());
});

// El condomino ve las visitas de su departamento; la guardia y la administracion, las de hoy y las proximas.
const listVisitas = asyncHandler(async (req, res) => {
  res.json(esResidente(req)
    ? await porteriaModel.findVisitasByUsuario(req.user.sub)
    : await porteriaModel.findVisitasPorteria());
});

const createVisita = asyncHandler(async (req, res) => {
  const departamento = await getDepartamento(req);
  const fecha = String(req.body.fecha || '');
  const hoy = await porteriaModel.getHoy();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(`${fecha}T00:00:00Z`))) {
    throw new HttpError(400, 'fecha debe tener formato YYYY-MM-DD');
  }

  const dias = Math.round((Date.parse(`${fecha}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86400000);

  if (dias < 0 || dias > DIAS_ANTICIPACION_MAX) {
    throw new HttpError(400, `La visita debe ser entre hoy y los proximos ${DIAS_ANTICIPACION_MAX} dias`);
  }

  const visita = await porteriaModel.createVisita({
    departamento_id: departamento.id,
    visitante: parseTexto(req.body.visitante, 120, 'visitante', true),
    documento: parseTexto(req.body.documento, 40),
    placa_vehiculo: parseTexto(req.body.placa_vehiculo, 20),
    fecha,
    nota: parseTexto(req.body.nota, 300),
    creado_por: req.user.sub,
  });

  res.locals.auditDetalle = `Visita de ${visita.visitante} el ${visita.fecha} (${visita.departamento_numero})`;
  res.status(201).json(visita);
});

const cancelarVisita = asyncHandler(async (req, res) => {
  const visita = await porteriaModel.cancelarVisita(parsePositiveInteger(req.params.id, 'id'), req.user.sub);

  if (!visita) {
    throw new HttpError(409, 'La visita no existe o ya no se puede cancelar');
  }

  res.locals.auditDetalle = `Visita de ${visita.visitante} el ${visita.fecha} (${visita.departamento_numero})`;
  res.json(visita);
});

const ingresoVisita = asyncHandler(async (req, res) => {
  const visita = await porteriaModel.registrarIngresoVisita(parsePositiveInteger(req.params.id, 'id'), req.user.sub);

  if (!visita) {
    throw new HttpError(409, 'La visita no existe, no esta anunciada para hoy o ya fue registrada');
  }

  res.locals.auditDetalle = `Ingreso de ${visita.visitante} - Torre ${visita.torre_numero}/${visita.departamento_numero}`;
  res.json(visita);
});

const listPaquetes = asyncHandler(async (req, res) => {
  res.json(esResidente(req)
    ? await porteriaModel.findPaquetesByUsuario(req.user.sub)
    : await porteriaModel.findPaquetesPorteria());
});

const createPaquete = asyncHandler(async (req, res) => {
  const departamento = await departamentoModel.findById(parsePositiveInteger(req.body.departamento_id, 'departamento_id'));

  if (!departamento) {
    throw new HttpError(404, 'Departamento no encontrado');
  }

  const paquete = await porteriaModel.createPaquete({
    departamento_id: departamento.id,
    descripcion: parseTexto(req.body.descripcion, 200, 'descripcion', true),
    recibido_por: req.user.sub,
  });

  res.locals.auditDetalle = `Paquete #${paquete.id} para Torre ${paquete.torre_numero}/${paquete.departamento_numero}`;
  res.status(201).json(paquete);
});

const entregarPaquete = asyncHandler(async (req, res) => {
  const paquete = await porteriaModel.entregarPaquete(parsePositiveInteger(req.params.id, 'id'), {
    entregado_a: parseTexto(req.body.entregado_a, 120, 'entregado_a', true),
    entregado_por: req.user.sub,
  });

  if (!paquete) {
    throw new HttpError(409, 'El paquete no existe o ya fue entregado');
  }

  res.locals.auditDetalle = `Paquete #${paquete.id} entregado a ${paquete.entregado_a}`;
  res.json(paquete);
});

module.exports = {
  listDepartamentos,
  listVisitas,
  createVisita,
  cancelarVisita,
  ingresoVisita,
  listPaquetes,
  createPaquete,
  entregarPaquete,
};
