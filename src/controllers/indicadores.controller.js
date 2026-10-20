const asyncHandler = require('../utils/asyncHandler');
const indicadoresModel = require('../models/indicadores.model');
const morosidadModel = require('../models/morosidad.model');
const { getVisibleTorreIds, isAdmin } = require('../utils/torreAccess');

// Indicadores del panel de inicio. Solo cifras agregadas: no expone datos de ningun departamento.
// La administracion ve todo el conjunto; el tesorero, sus torres.
const resumen = asyncHandler(async (req, res) => {
  const esAdmin = isAdmin(req);
  const torreIds = await getVisibleTorreIds(req);

  const hoy = new Date();
  const anio = hoy.getFullYear();
  const mesCorte = hoy.getMonth() + 1;

  const [departamentos, recaudacion, recaudacionMensual, porRevisar] = await Promise.all([
    torreIds.length > 0 ? morosidadModel.findByTorreIds({ torre_ids: torreIds, anio, mes_corte: mesCorte }) : [],
    indicadoresModel.recaudacion(torreIds),
    indicadoresModel.recaudacionMensual(torreIds),
    indicadoresModel.porRevisar(torreIds, { incluirTorres: esAdmin }),
  ]);

  const morosos = departamentos.filter((d) => d.total_adeudado > 0);
  const sumar = (campo) => morosos.reduce((total, d) => total + d[campo], 0);

  res.json({
    anio,
    mes_corte: mesCorte,
    alcance: esAdmin ? 'conjunto' : 'torres',
    departamentos: {
      total: departamentos.length,
      al_dia: departamentos.length - morosos.length,
      morosos: morosos.length,
      porcentaje_al_dia: departamentos.length > 0
        ? Math.round(((departamentos.length - morosos.length) / departamentos.length) * 100)
        : 0,
    },
    cartera: {
      alicuotas: sumar('alicuotas_adeudadas'),
      multas: sumar('multas_adeudadas'),
      cargos: sumar('cargos_adeudados'),
      total: sumar('total_adeudado'),
    },
    recaudacion,
    recaudacion_mensual: recaudacionMensual,
    por_revisar: porRevisar,
  });
});

module.exports = { resumen };
