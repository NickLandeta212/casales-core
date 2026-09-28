const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const departamentoModel = require('../models/departamento.model');
const { getAuthorizedTorreIds } = require('../utils/torreAccess');

async function findVisibleDepartamentos(req) {
  if (req.user.role === 'admin_general') {
    return departamentoModel.findAll();
  }

  if (req.user.role === 'condomino') {
    return departamentoModel.findByUsuarioId(req.user.sub);
  }

  const torreIds = await getAuthorizedTorreIds(req);

  if (torreIds.length > 0) {
    return departamentoModel.findByTorreIds(torreIds);
  }

  return req.user.role === 'tesorero' ? departamentoModel.findByUsuarioId(req.user.sub) : [];
}

const list = asyncHandler(async (req, res) => {
  res.json(await findVisibleDepartamentos(req));
});

const getById = asyncHandler(async (req, res) => {
  const requestedId = Number(req.params.id);
  const departamento = req.user.role === 'admin_general'
    ? await departamentoModel.findById(requestedId)
    : (await findVisibleDepartamentos(req)).find((row) => row.id === requestedId) || null;

  if (!departamento) {
    throw new HttpError(404, 'Departamento no encontrado');
  }

  res.json(departamento);
});

const remove = asyncHandler(async (req, res) => {
  const departamento = await departamentoModel.remove(Number(req.params.id));

  if (!departamento) {
    throw new HttpError(404, 'Departamento no encontrado');
  }

  res.json({ message: 'Departamento eliminado correctamente' });
});

module.exports = { list, getById, remove };
