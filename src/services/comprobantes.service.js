const crypto = require('crypto');
const HttpError = require('../utils/httpError');

// Los comprobantes viven en un bucket privado de Supabase Storage (migracion 005).
const BUCKET = 'comprobantes';
// Las tablas guardan el comprobante como /uploads/comprobantes/<archivo> (formato heredado de cuando
// se servian desde disco). Ya no es una URL publica: solo identifica el archivo dentro del bucket.
const STORED_PREFIX = '/uploads/comprobantes/';
const FILE_NAME_PATTERN = /^[a-z0-9-]+\.(png|jpg|webp|pdf)$/;
const CONTENT_TYPES = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', pdf: 'application/pdf' };
const SIGNED_URL_SECONDS = 60;
const maxFileSizeInBytes = 4 * 1024 * 1024;

// Tipos aceptados segun el uso: los pagos y fotos solo admiten imagenes; los documentos y egresos tambien PDF.
const SOLO_IMAGENES = ['png', 'jpg', 'webp'];
const IMAGENES_O_PDF = ['png', 'jpg', 'webp', 'pdf'];

function detectFileType(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png';
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpg';
  }

  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'webp';
  }

  if (buffer.length >= 5 && buffer.toString('ascii', 0, 5) === '%PDF-') {
    return 'pdf';
  }

  return null;
}

function getStorageBaseUrl() {
  const baseUrl = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');

  if (!baseUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new HttpError(503, 'El almacenamiento de comprobantes no esta configurado (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY)');
  }

  return `${baseUrl}/storage/v1`;
}

async function storageRequest(method, resource, { body, contentType, upsert = false } = {}) {
  const storageUrl = getStorageBaseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  if (contentType) {
    headers['Content-Type'] = contentType;
  }

  if (upsert) {
    headers['x-upsert'] = 'true';
  }

  try {
    return await fetch(`${storageUrl}/${resource}`, { method, headers, body });
  } catch (error) {
    console.error('Supabase Storage no responde:', error.message);
    throw new HttpError(502, 'No se pudo conectar con el almacenamiento de comprobantes');
  }
}

// Nombre del archivo dentro del bucket a partir del valor guardado en la BD, o null si no es valido.
function getFileName(storedValue) {
  const fileName = String(storedValue || '').trim().split('/').pop();

  return FILE_NAME_PATTERN.test(fileName) ? fileName : null;
}

function toStoredPath(fileName) {
  return `${STORED_PREFIX}${fileName}`;
}

async function uploadFile(fileName, buffer, { upsert = false } = {}) {
  const response = await storageRequest('POST', `object/${BUCKET}/${fileName}`, {
    body: buffer,
    contentType: CONTENT_TYPES[fileName.split('.').pop()],
    upsert,
  });

  if (!response.ok) {
    console.error(`Supabase Storage rechazo ${fileName}: ${response.status} ${await response.text()}`);
    throw new HttpError(502, 'No se pudo guardar el comprobante');
  }
}

function describirTipos(tipos) {
  const nombres = tipos.map((tipo) => tipo.toUpperCase());
  return nombres.length > 1 ? `${nombres.slice(0, -1).join(', ')} o ${nombres[nombres.length - 1]}` : nombres[0];
}

// Guarda un archivo recibido como data URL (data:<tipo>;base64,...) y devuelve el valor a guardar en la BD.
// nombre: como se llama el archivo en los mensajes de error (comprobante, documento, foto).
async function saveArchivo(dataUrl, prefix, { tipos = SOLO_IMAGENES, nombre = 'comprobante' } = {}) {
  if (!dataUrl) {
    throw new HttpError(400, `El ${nombre} es requerido`);
  }

  const match = String(dataUrl).match(/^data:(?:image\/(png|jpe?g|webp)|application\/(pdf));base64,(.+)$/i);
  const extension = match ? String(match[1] || match[2]).toLowerCase().replace('jpeg', 'jpg') : null;

  if (!extension || !tipos.includes(extension)) {
    throw new HttpError(400, `El ${nombre} debe ser un archivo ${describirTipos(tipos)} valido`);
  }

  const buffer = Buffer.from(match[3], 'base64');

  if (buffer.length > maxFileSizeInBytes) {
    throw new HttpError(400, `El ${nombre} supera el maximo de 4MB`);
  }

  // El tipo declarado debe coincidir con el contenido real del archivo.
  if (detectFileType(buffer) !== extension) {
    throw new HttpError(400, `El ${nombre} no es un archivo ${describirTipos(tipos)} valido`);
  }

  const fileName = `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${extension}`;

  await uploadFile(fileName, buffer);

  return toStoredPath(fileName);
}

// Sube varias fotos (data URLs) una por una; si alguna falla borra las que ya se habian subido.
async function saveFotos(dataUrls, prefix) {
  const guardadas = [];

  try {
    for (const dataUrl of dataUrls) {
      guardadas.push(await saveArchivo(dataUrl, prefix, { nombre: 'foto' }));
    }
  } catch (error) {
    await Promise.all(guardadas.map((url) => removeComprobante(url)));
    throw error;
  }

  return guardadas;
}

// Nunca lanza: se usa para limpiar despues de un fallo y no debe ocultar el error original.
async function removeComprobante(comprobanteUrl) {
  const fileName = getFileName(comprobanteUrl);

  if (!fileName) {
    return;
  }

  try {
    const response = await storageRequest('DELETE', `object/${BUCKET}/${fileName}`);

    if (!response.ok) {
      console.error(`No se pudo borrar el comprobante ${fileName}: ${response.status}`);
    }
  } catch (error) {
    console.error(`No se pudo borrar el comprobante ${fileName}: ${error.message}`);
  }
}

// Enlace temporal para ver un comprobante. Quien lo pide ya debe estar autorizado.
async function createSignedUrl(fileName) {
  const response = await storageRequest('POST', `object/sign/${BUCKET}/${fileName}`, {
    body: JSON.stringify({ expiresIn: SIGNED_URL_SECONDS }),
    contentType: 'application/json',
  });

  if (response.status === 400 || response.status === 404) {
    throw new HttpError(404, 'El archivo del comprobante ya no esta disponible');
  }

  if (!response.ok) {
    console.error(`Supabase Storage no firmo ${fileName}: ${response.status} ${await response.text()}`);
    throw new HttpError(502, 'No se pudo abrir el comprobante');
  }

  const { signedURL } = await response.json();

  return `${getStorageBaseUrl()}${signedURL}`;
}

function saveComprobante(dataUrl, prefix) {
  return saveArchivo(dataUrl, prefix);
}

function saveReservaComprobante(dataUrl, reservaId) {
  return saveComprobante(dataUrl, `reserva-${reservaId}`);
}

function savePagoMultaComprobante(dataUrl, departamentoId) {
  return saveComprobante(dataUrl, `pago-multa-${departamentoId}`);
}

function savePagoAlicuotaComprobante(dataUrl, departamentoId) {
  return saveComprobante(dataUrl, `pago-alicuota-${departamentoId}`);
}

function savePagoCargoComprobante(dataUrl, departamentoId) {
  return saveComprobante(dataUrl, `pago-cargo-${departamentoId}`);
}

// Guarda el comprobante y lo borra si la operacion que lo usa falla,
// para no dejar archivos huerfanos en el bucket.
async function withComprobante(saveFn, operation) {
  const comprobanteUrl = await saveFn();

  try {
    return await operation(comprobanteUrl);
  } catch (error) {
    await removeComprobante(comprobanteUrl);
    throw error;
  }
}

module.exports = {
  SOLO_IMAGENES,
  IMAGENES_O_PDF,
  saveArchivo,
  saveFotos,
  withComprobante,
  removeComprobante,
  saveReservaComprobante,
  savePagoMultaComprobante,
  savePagoAlicuotaComprobante,
  savePagoCargoComprobante,
  getFileName,
  toStoredPath,
  uploadFile,
  createSignedUrl,
};
