const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const correoService = require('../services/correo.service');

function validatePayload(body) {
  if (!body || typeof body !== 'object') {
    throw new HttpError(400, 'El cuerpo de la solicitud es requerido');
  }

  if (!String(body.email_destinatario || '').trim()) {
    throw new HttpError(400, 'email_destinatario es requerido');
  }
}

const sendFacturaByEmail = asyncHandler(async (req, res) => {
  validatePayload(req.body);

  const result = await correoService.sendFacturaByEmail({
    email_destinatario: req.body.email_destinatario,
    asunto: req.body.asunto,
    factura: req.body.factura,
    items: req.body.items,
    total: req.body.total,
    mensaje: req.body.mensaje,
    attachments: req.body.attachments,
    pdf_base64: req.body.pdf_base64,
    pdf_filename: req.body.pdf_filename,
  });

  res.status(200).json({
    message: 'Factura enviada correctamente',
    ...result,
  });
});

const verifySmtp = asyncHandler(async (_req, res) => {
  const result = await correoService.verifySmtpConnection();

  res.status(200).json({
    message: 'SMTP conectado correctamente',
    ...result,
  });
});

module.exports = { sendFacturaByEmail, verifySmtp };
