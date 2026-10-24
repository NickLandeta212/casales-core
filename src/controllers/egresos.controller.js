const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const egresoModel = require('../models/egreso.model');
const proveedorModel = require('../models/proveedor.model');
const comprobantesService = require('../services/comprobantes.service');
const { CATEGORIAS_EGRESO, CATEGORIA_EGRESO_KEYS } = require('../config/catalogos');
const { filtroDeAlcance, assertPuedeGestionar } = require('../utils/alcanceFinanciero');
const {
  parsePositiveInteger, parseMonto, parseTexto, parseFecha, parseOpcion, parseEmailOpcional, parseAnio,
} = require('../utils/validators');

const VALOR_EGRESO_MAX = 1000000;

const catalogos = asyncHandler(async (req, res) => {
  res.json({ categorias: CATEGORIAS_EGRESO });
});

// ---------- Proveedores (catalogo compartido por la administracion y la tesoreria) ----------

function parseProveedor(body) {
  const ruc = String(body.ruc || '').replace(/\s/g, '');

  if (!/^\d{10}(\d{3})?$/.test(ruc)) {
    throw new HttpError(400, 'El RUC debe tener 13 digitos (o 10 si es cedula)');
  }

  return {
    nombre: parseTexto(body.nombre, 150, 'nombre', true),
    ruc,
    telefono: parseTexto(body.telefono, 30, 'telefono') || null,
    email: parseEmailOpcional(body.email),
    activo: body.activo !== false,
  };
}

const listProveedores = asyncHandler(async (req, res) => {
  res.json(await proveedorModel.findProveedores({ soloActivos: req.query.activos === 'true' }));
});

const createProveedor = asyncHandler(async (req, res) => {
  const proveedor = await proveedorModel.createProveedor(parseProveedor(req.body));
  res.locals.auditDetalle = `Proveedor ${proveedor.nombre} (RUC ${proveedor.ruc})`;
  res.status(201).json(proveedor);
});

const updateProveedor = asyncHandler(async (req, res) => {
  const proveedor = await proveedorModel.updateProveedor(parsePositiveInteger(req.params.id, 'id'), parseProveedor(req.body));

  if (!proveedor) {
    throw new HttpError(404, 'Proveedor no encontrado');
  }

  res.locals.auditDetalle = `Proveedor ${proveedor.nombre} (RUC ${proveedor.ruc})${proveedor.activo ? '' : ' desactivado'}`;
  res.json(proveedor);
});

// ---------- Egresos ----------

async function parseEgreso(body) {
  const alcance = parseOpcion(body.alcance, ['conjunto', 'torre'], 'alcance');
  const estado = parseOpcion(body.estado || 'pendiente', ['pendiente', 'pagado'], 'estado');
  const proveedorId = parsePositiveInteger(body.proveedor_id, 'proveedor_id');
  const proveedor = await proveedorModel.findProveedorById(proveedorId);

  if (!proveedor || !proveedor.activo) {
    throw new HttpError(400, 'Elige un proveedor activo');
  }

  const fecha = parseFecha(body.fecha, 'fecha');

  return {
    alcance,
    torre_id: alcance === 'torre' ? parsePositiveInteger(body.torre_id, 'torre_id') : null,
    proveedor_id: proveedorId,
    categoria: parseOpcion(body.categoria, CATEGORIA_EGRESO_KEYS, 'categoria'),
    concepto: parseTexto(body.concepto, 200, 'concepto', true),
    numero_documento: parseTexto(body.numero_documento, 40, 'numero_documento') || null,
    fecha,
    valor: parseMonto(body.valor, 'valor', VALOR_EGRESO_MAX),
    estado,
    // Si se registra ya pagado y no se indica la fecha de pago, se usa la fecha del documento.
    fecha_pago: estado === 'pagado' ? parseFecha(body.fecha_pago, 'fecha_pago', false) || fecha : null,
  };
}

function guardarComprobante(dataUrl, prefijo) {
  return comprobantesService.saveArchivo(dataUrl, prefijo, { tipos: comprobantesService.IMAGENES_O_PDF });
}

function describir(egreso) {
  return `"${egreso.concepto}" de ${egreso.proveedor_nombre} por $${Number(egreso.valor).toFixed(2)}`;
}

// Administracion: egresos del conjunto. Tesorero: egresos de sus torres.
const list = asyncHandler(async (req, res) => {
  const anio = req.query.anio ? parseAnio(req.query.anio) : null;
  res.json(await egresoModel.findAll({ ...(await filtroDeAlcance(req)), anio }));
});

const create = asyncHandler(async (req, res) => {
  const datos = await parseEgreso(req.body);
  await assertPuedeGestionar(req, datos);

  const registrar = (comprobante_url) => egresoModel.create({ ...datos, comprobante_url, creado_por: req.user.sub });
  const egreso = req.body.comprobante_base64
    ? await comprobantesService.withComprobante(() => guardarComprobante(req.body.comprobante_base64, 'egreso'), registrar)
    : await registrar(null);

  res.locals.auditDetalle = `Egreso ${describir(egreso)} (${egreso.estado})`;
  res.status(201).json(egreso);
});

const pagar = asyncHandler(async (req, res) => {
  const id = parsePositiveInteger(req.params.id, 'id');
  const fechaPago = parseFecha(req.body.fecha_pago, 'fecha_pago');
  const assertPermiso = (egreso) => assertPuedeGestionar(req, egreso);

  // Se valida el permiso antes de subir el archivo para no guardar comprobantes de quien no puede pagar.
  const actual = await egresoModel.findById(id);

  if (!actual) {
    throw new HttpError(404, 'Egreso no encontrado');
  }

  await assertPermiso(actual);

  const registrar = (comprobante_url) => egresoModel.pagar(id, { fecha_pago: fechaPago, comprobante_url, user_id: req.user.sub, assertPermiso });
  const egreso = req.body.comprobante_base64
    ? await comprobantesService.withComprobante(() => guardarComprobante(req.body.comprobante_base64, `egreso-${id}`), registrar)
    : await registrar(null);

  res.locals.auditDetalle = `Egreso ${describir(egreso)} pagado el ${egreso.fecha_pago}`;
  res.json(egreso);
});

const anular = asyncHandler(async (req, res) => {
  const id = parsePositiveInteger(req.params.id, 'id');
  const motivo = String(req.body.motivo || '').trim();

  if (motivo.length < 10 || motivo.length > 500) {
    throw new HttpError(400, 'Indica el motivo de la anulacion (entre 10 y 500 caracteres)');
  }

  const egreso = await egresoModel.anular(id, {
    motivo,
    user_id: req.user.sub,
    assertPermiso: (registro) => assertPuedeGestionar(req, registro),
  });

  res.locals.auditDetalle = `Egreso ${describir(egreso)} anulado. Motivo: ${motivo}`;
  res.json(egreso);
});

module.exports = { catalogos, listProveedores, createProveedor, updateProveedor, list, create, pagar, anular };
