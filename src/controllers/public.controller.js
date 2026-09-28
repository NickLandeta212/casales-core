const asyncHandler = require('../utils/asyncHandler');
const torreModel = require('../models/torre.model');
const alicuotaModel = require('../models/alicuota.model');
const reservaModel = require('../models/reserva.model');
const { parsePositiveInteger } = require('../utils/validators');

// Configuracion que necesita el frontend publico (ej. site key del captcha, si esta activo).
function getConfig(_req, res) {
  res.json({ captcha_site_key: String(process.env.TURNSTILE_SITE_KEY || '').trim() || null });
}

const listTorres = asyncHandler(async (_req, res) => {
  const torres = await torreModel.findAll();
  res.json(torres.map(({ id, numero }) => ({ id, numero })));
});

const listDepartamentos = asyncHandler(async (req, res) => {
  const torreId = parsePositiveInteger(req.params.torreId, 'torreId');
  const departamentos = await alicuotaModel.findDepartamentosByTorre(torreId);
  res.json(departamentos.map(({ id, numero, torre_id, torre_numero }) => ({ id, numero, torre_id, torre_numero })));
});

const listFechasOcupadas = asyncHandler(async (_req, res) => {
  res.json(await reservaModel.findFechasOcupadas());
});

module.exports = { getConfig, listTorres, listDepartamentos, listFechasOcupadas };
