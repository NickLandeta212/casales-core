const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const presupuestoModel = require('../models/presupuesto.model');
const egresoModel = require('../models/egreso.model');
const { CATEGORIAS_EGRESO, CATEGORIA_EGRESO_KEYS } = require('../config/catalogos');
const { assertPuedeGestionar } = require('../utils/alcanceFinanciero');
const { isAdmin } = require('../utils/torreAccess');
const { parseAnio, parsePositiveInteger } = require('../utils/validators');

const MONTO_MAX = 10000000;

// La administracion trabaja el presupuesto del conjunto; el tesorero, el de la torre que elija entre las suyas.
async function resolverAlcance(req, torreIdRaw) {
  const destino = isAdmin(req)
    ? { alcance: 'conjunto', torre_id: null }
    : { alcance: 'torre', torre_id: parsePositiveInteger(torreIdRaw, 'torre_id') };

  await assertPuedeGestionar(req, destino);
  return destino;
}

function redondear(valor) {
  return Math.round(Number(valor) * 100) / 100;
}

// Presupuesto vs. ejecucion: ejecutado = egresos pagados en el anio; comprometido = egresos pendientes.
const resumen = asyncHandler(async (req, res) => {
  const anio = parseAnio(req.query.anio);
  const destino = await resolverAlcance(req, req.query.torre_id);
  const [montos, totales] = await Promise.all([
    presupuestoModel.findMontos({ anio, ...destino }),
    egresoModel.totalesPorCategoria({ anio, ...destino }),
  ]);

  const categorias = CATEGORIAS_EGRESO.map(({ key, label }) => {
    const presupuesto = Number(montos.find((m) => m.categoria === key)?.monto || 0);
    const total = totales.find((t) => t.categoria === key);
    const ejecutado = Number(total?.ejecutado || 0);
    const comprometido = Number(total?.comprometido || 0);

    return {
      categoria: key,
      label,
      presupuesto,
      ejecutado,
      comprometido,
      disponible: redondear(presupuesto - ejecutado - comprometido),
      porcentaje: presupuesto > 0 ? Math.round((ejecutado / presupuesto) * 100) : null,
    };
  });

  const suma = (campo) => redondear(categorias.reduce((acc, c) => acc + c[campo], 0));
  const presupuestoTotal = suma('presupuesto');

  res.json({
    anio,
    ...destino,
    categorias,
    totales: {
      presupuesto: presupuestoTotal,
      ejecutado: suma('ejecutado'),
      comprometido: suma('comprometido'),
      disponible: suma('disponible'),
      porcentaje: presupuestoTotal > 0 ? Math.round((suma('ejecutado') / presupuestoTotal) * 100) : null,
    },
  });
});

const guardar = asyncHandler(async (req, res) => {
  const anio = parseAnio(req.body.anio, { requerido: true });
  const destino = await resolverAlcance(req, req.body.torre_id);

  if (!Array.isArray(req.body.montos) || req.body.montos.length === 0) {
    throw new HttpError(400, 'montos es requerido');
  }

  const montos = req.body.montos.map((item) => {
    const monto = Number(item?.monto || 0);

    if (!CATEGORIA_EGRESO_KEYS.includes(item?.categoria)) {
      throw new HttpError(400, 'Categoria de presupuesto invalida');
    }

    if (!Number.isFinite(monto) || monto < 0 || monto > MONTO_MAX) {
      throw new HttpError(400, 'Los montos del presupuesto deben ser cero o mayores');
    }

    return { categoria: item.categoria, monto: redondear(monto) };
  });

  await presupuestoModel.saveMontos({ anio, ...destino, montos, user_id: req.user.sub });

  const total = montos.reduce((acc, m) => acc + m.monto, 0);
  res.locals.auditDetalle = `Presupuesto ${anio} ${destino.alcance === 'torre' ? `torre ${destino.torre_id}` : 'del conjunto'}: $${total.toFixed(2)}`;
  res.json({ message: 'Presupuesto guardado' });
});

module.exports = { resumen, guardar };
