const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const morosidadModel = require('../models/morosidad.model');
const { getVisibleTorreIds } = require('../utils/torreAccess');
const { parsePositiveInteger } = require('../utils/validators');

// Reporte de deuda por departamento: la administracion ve todas las torres; el tesorero, las suyas.
const list = asyncHandler(async (req, res) => {
  const autorizadas = await getVisibleTorreIds(req);
  const torreId = req.query.torre_id ? parsePositiveInteger(req.query.torre_id, 'torre_id') : null;

  if (torreId && !autorizadas.includes(torreId)) {
    throw new HttpError(403, 'No tienes permisos para ver la morosidad de esta torre');
  }

  const hoy = new Date();
  const anio = hoy.getFullYear();
  const mesCorte = hoy.getMonth() + 1;
  const departamentos = await morosidadModel.findByTorreIds({
    torre_ids: torreId ? [torreId] : autorizadas,
    anio,
    mes_corte: mesCorte,
  });
  const morosos = departamentos.filter((departamento) => departamento.total_adeudado > 0);

  res.json({
    anio,
    mes_corte: mesCorte,
    resumen: {
      departamentos: departamentos.length,
      al_dia: departamentos.length - morosos.length,
      morosos: morosos.length,
      alicuotas_adeudadas: morosos.reduce((total, d) => total + d.alicuotas_adeudadas, 0),
      multas_adeudadas: morosos.reduce((total, d) => total + d.multas_adeudadas, 0),
      cargos_adeudados: morosos.reduce((total, d) => total + d.cargos_adeudados, 0),
      total_adeudado: morosos.reduce((total, d) => total + d.total_adeudado, 0),
    },
    departamentos,
  });
});

module.exports = { list };
