const HttpError = require('./httpError');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ANIO_MIN = 2000;
const ANIO_MAX = 2200;

function normalizeEmail(value, fieldName = 'email_destinatario') {
  const email = String(value || '').trim().toLowerCase();

  if (!email) {
    throw new HttpError(400, `${fieldName} es requerido`);
  }

  if (!EMAIL_REGEX.test(email)) {
    throw new HttpError(400, `${fieldName} debe ser un correo valido`);
  }

  return email;
}

function parsePositiveInteger(value, fieldName) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new HttpError(400, `${fieldName} debe ser un entero positivo`);
  }

  return parsed;
}

// Lista de ids enteros positivos; descarta en silencio lo que no lo sea.
function normalizeIds(ids) {
  return Array.isArray(ids)
    ? ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
    : [];
}

function parseMonto(value, fieldName, max = Infinity) {
  const monto = Number(value);

  if (!Number.isFinite(monto) || monto <= 0 || monto > max) {
    throw new HttpError(400, `${fieldName} debe ser mayor a cero`);
  }

  return monto;
}

// Sin valor se asume el anio en curso, salvo que sea requerido.
function parseAnio(value, { requerido = false } = {}) {
  const anio = value || requerido ? parsePositiveInteger(value, 'anio') : new Date().getFullYear();

  if (anio < ANIO_MIN || anio > ANIO_MAX) {
    throw new HttpError(400, 'anio fuera de rango');
  }

  return anio;
}

function parseMes(value) {
  const mes = parsePositiveInteger(value, 'mes');

  if (mes > 12) {
    throw new HttpError(400, 'mes debe estar entre 1 y 12');
  }

  return mes;
}

// Texto libre recortado a max caracteres.
function parseTexto(value, max, fieldName, requerido = false) {
  const texto = String(value || '').trim().slice(0, max);

  if (requerido && !texto) {
    throw new HttpError(400, `${fieldName} es requerido`);
  }

  return texto;
}

function parseMotivoRechazo(value) {
  const motivo = String(value || '').trim();

  if (motivo.length < 5) {
    throw new HttpError(400, 'Indica el motivo del rechazo (minimo 5 caracteres)');
  }

  if (motivo.length > 500) {
    throw new HttpError(400, 'El motivo del rechazo no debe superar 500 caracteres');
  }

  return motivo;
}

// Fecha en formato YYYY-MM-DD que exista en el calendario. Sin valor devuelve null, salvo que sea requerida.
function parseFecha(value, fieldName, requerido = true) {
  const fecha = String(value || '').trim();

  if (!fecha && !requerido) {
    return null;
  }

  const date = new Date(`${fecha}T00:00:00Z`);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== fecha) {
    throw new HttpError(400, `${fieldName} debe ser una fecha valida (YYYY-MM-DD)`);
  }

  return fecha;
}

// Valor que debe ser una de las opciones permitidas.
function parseOpcion(value, opciones, fieldName) {
  if (!opciones.includes(value)) {
    throw new HttpError(400, `${fieldName} debe ser: ${opciones.join(', ')}`);
  }

  return value;
}

// Correo opcional: vacio devuelve null.
function parseEmailOpcional(value, fieldName = 'email') {
  return String(value || '').trim() ? normalizeEmail(value, fieldName) : null;
}

module.exports = {
  EMAIL_REGEX,
  normalizeEmail,
  parsePositiveInteger,
  normalizeIds,
  parseMonto,
  parseAnio,
  parseMes,
  parseTexto,
  parseMotivoRechazo,
  parseFecha,
  parseOpcion,
  parseEmailOpcional,
};
