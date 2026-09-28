const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const HttpError = require('../utils/httpError');

const uploadsRoot = path.resolve(__dirname, '../../uploads/comprobantes');
const maxImageSizeInBytes = 4 * 1024 * 1024;

function detectImageType(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png';
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpg';
  }

  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'webp';
  }

  return null;
}

function saveComprobante(dataUrl, prefix) {
  if (!dataUrl) {
    throw new HttpError(400, 'comprobante_base64 es requerido');
  }

  const match = String(dataUrl).match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/i);

  if (!match) {
    throw new HttpError(400, 'El comprobante debe ser una imagen PNG, JPG o WEBP valida');
  }

  const extension = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
  const buffer = Buffer.from(match[2], 'base64');

  if (buffer.length > maxImageSizeInBytes) {
    throw new HttpError(400, 'El comprobante supera el maximo de 4MB');
  }

  // El tipo declarado debe coincidir con el contenido real del archivo.
  if (detectImageType(buffer) !== extension) {
    throw new HttpError(400, 'El archivo no es una imagen PNG, JPG o WEBP valida');
  }

  fs.mkdirSync(uploadsRoot, { recursive: true });

  const fileName = `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${extension}`;
  const fullPath = path.join(uploadsRoot, fileName);

  fs.writeFileSync(fullPath, buffer);

  return `/uploads/comprobantes/${fileName}`;
}

function removeComprobante(comprobanteUrl) {
  const fileName = path.basename(String(comprobanteUrl || ''));

  if (fileName) {
    fs.rmSync(path.join(uploadsRoot, fileName), { force: true });
  }
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

// Guarda el comprobante y lo borra si la operacion que lo usa falla,
// para no dejar archivos huerfanos en disco.
async function withComprobante(saveFn, operation) {
  const comprobanteUrl = saveFn();

  try {
    return await operation(comprobanteUrl);
  } catch (error) {
    removeComprobante(comprobanteUrl);
    throw error;
  }
}

module.exports = { withComprobante, removeComprobante, saveReservaComprobante, savePagoMultaComprobante, savePagoAlicuotaComprobante };
