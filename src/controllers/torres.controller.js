const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const torreModel = require('../models/torre.model');
const { getAuthorizedTorreIds } = require('../utils/torreAccess');

function canSeeAllTorres(role) {
  return role === 'admin_general' || role === 'admin_conjunto';
}

const list = asyncHandler(async (req, res) => {
  const torres = canSeeAllTorres(req.user.role)
    ? await torreModel.findAll()
    : await torreModel.findByIds(await getAuthorizedTorreIds(req));

  res.json(torres);
});

const getById = asyncHandler(async (req, res) => {
  const torre = await torreModel.findById(Number(req.params.id));

  if (!torre) {
    throw new HttpError(404, 'Torre no encontrada');
  }

  if (!canSeeAllTorres(req.user.role) && !(await getAuthorizedTorreIds(req)).includes(torre.id)) {
    throw new HttpError(403, 'No tienes permisos para consultar esta torre');
  }

  res.json(torre);
});

module.exports = { list, getById };
