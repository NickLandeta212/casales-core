const HttpError = require('./httpError');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

module.exports = { EMAIL_REGEX, normalizeEmail, parsePositiveInteger, parseMotivoRechazo };
