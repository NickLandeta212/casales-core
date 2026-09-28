const asyncHandler = require('../utils/asyncHandler');
const auditoriaModel = require('../models/auditoria.model');

const list = asyncHandler(async (req, res) => {
  const modulo = String(req.query.modulo || '').trim() || null;
  res.json(await auditoriaModel.findRecent({ limit: req.query.limit, modulo }));
});

module.exports = { list };
