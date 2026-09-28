const asyncHandler = require('../utils/asyncHandler');
const correoService = require('../services/correo.service');

const verifySmtp = asyncHandler(async (_req, res) => {
  const result = await correoService.verifySmtpConnection();

  res.status(200).json({
    message: 'SMTP conectado correctamente',
    ...result,
  });
});

module.exports = { verifySmtp };
