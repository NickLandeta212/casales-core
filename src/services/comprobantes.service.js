const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const HttpError = require('../utils/httpError');

const uploadsRoot = path.resolve(__dirname, '../../uploads/comprobantes');
const maxImageSizeInBytes = 4 * 1024 * 1024;

function saveReservaComprobante(dataUrl, reservaId) {
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

  fs.mkdirSync(uploadsRoot, { recursive: true });

  const fileName = `reserva-${reservaId}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${extension}`;
  const fullPath = path.join(uploadsRoot, fileName);

  fs.writeFileSync(fullPath, buffer);

  return `/uploads/comprobantes/${fileName}`;
}

module.exports = { saveReservaComprobante };
