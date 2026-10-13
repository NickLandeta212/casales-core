const HttpError = require('./httpError');
const departamentoModel = require('../models/departamento.model');

// Departamento del condomino autenticado: siempre sale de la sesion, nunca del cuerpo de la peticion.
async function getDepartamento(req) {
  const [departamento] = await departamentoModel.findByUsuarioId(req.user.sub);

  if (!departamento) {
    throw new HttpError(404, 'Tu cuenta no tiene un departamento asignado. Contacta a la administracion.');
  }

  return departamento;
}

module.exports = { getDepartamento };
