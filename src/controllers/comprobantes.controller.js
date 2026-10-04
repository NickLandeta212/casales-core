const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const comprobanteModel = require('../models/comprobante.model');
const comprobantesService = require('../services/comprobantes.service');
const { getAuthorizedTorreIds } = require('../utils/torreAccess');
const { ADMINS } = require('../config/permisos');

// Mismas reglas que los listados: el tesorero ve lo de sus torres, el condomino lo de su departamento
// y la administracion solo los pagos de torres al conjunto y las reservas (no los pagos de departamentos).
function puedeVer(user, torreIds, origen) {
  if (user.role === 'tesorero') {
    return torreIds.includes(Number(origen.torre_id));
  }

  if (user.role === 'condomino') {
    return origen.usuario_id !== null && Number(origen.usuario_id) === Number(user.sub);
  }

  return ADMINS.includes(user.role) && (origen.tipo === 'pago_torre' || origen.tipo === 'reserva');
}

const enlace = asyncHandler(async (req, res) => {
  const archivo = comprobantesService.getFileName(req.params.archivo);

  if (!archivo) {
    throw new HttpError(400, 'Comprobante invalido');
  }

  const origenes = await comprobanteModel.findOrigenes(comprobantesService.toStoredPath(archivo));
  const torreIds = await getAuthorizedTorreIds(req);

  // Mismo 404 si no existe o si no le corresponde: no se revela que archivos existen.
  if (!origenes.some((origen) => puedeVer(req.user, torreIds, origen))) {
    throw new HttpError(404, 'Comprobante no encontrado');
  }

  res.json({ url: await comprobantesService.createSignedUrl(archivo) });
});

module.exports = { enlace };
