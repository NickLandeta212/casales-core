const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const departamentoModel = require('../models/departamento.model');
const { getAuthorizedTorreIds, isAdmin } = require('../utils/torreAccess');

// La administracion ve todos los departamentos (igual que todas las torres); el tesorero, los de sus torres.
async function findVisibleDepartamentos(req) {
  if (isAdmin(req)) {
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
  const departamento = isAdmin(req)
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
