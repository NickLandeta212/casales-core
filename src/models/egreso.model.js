const { pool, withTransaction } = require('../config/database');
const HttpError = require('../utils/httpError');
const finanzasModel = require('./finanzas.model');

// Egresos (gastos y ordenes de compra) del conjunto o de una torre.
// Ciclo de vida: pendiente -> pagado, o pendiente/pagado -> anulado (con motivo).
// Al pagarse se registra el gasto en finanzas; al anularse ese gasto se quita.

const EGRESO_SELECT = `
  SELECT e.id, e.alcance, e.torre_id, t.numero AS torre_numero,
         e.proveedor_id, p.nombre AS proveedor_nombre, p.ruc AS proveedor_ruc,
         e.categoria, e.concepto, e.numero_documento,
         TO_CHAR(e.fecha, 'YYYY-MM-DD') AS fecha, e.valor, e.estado,
         TO_CHAR(e.fecha_pago, 'YYYY-MM-DD') AS fecha_pago,
         e.comprobante_url, e.motivo_anulacion, e.anulado_at, e.created_at,
         uc.nombre AS creado_por_nombre, ua.nombre AS anulado_por_nombre
  FROM egresos e
  INNER JOIN proveedores p ON p.id = e.proveedor_id
  LEFT JOIN torres t ON t.id = e.torre_id
  LEFT JOIN usuarios uc ON uc.id = e.creado_por
  LEFT JOIN usuarios ua ON ua.id = e.anulado_por`;

// alcance 'conjunto' | 'torre'; torre_ids limita a esas torres. anio opcional (por fecha del egreso).
async function findAll({ alcance, torre_ids = null, anio = null }) {
  const values = [alcance];
  const filters = ['e.alcance = $1'];

  if (Array.isArray(torre_ids)) {
    values.push(torre_ids);
    filters.push(`e.torre_id = ANY($${values.length}::int[])`);
  }

  if (anio) {
    values.push(anio);
    filters.push(`EXTRACT(YEAR FROM e.fecha) = $${values.length}`);
  }

  const result = await pool.query(`${EGRESO_SELECT} WHERE ${filters.join(' AND ')} ORDER BY e.fecha DESC, e.id DESC`, values);
  return result.rows;
}

async function findById(id, client = pool) {
  const result = await client.query(`${EGRESO_SELECT} WHERE e.id = $1`, [id]);
  return result.rows[0] || null;
}

function conceptoFinanzas(egreso) {
  return `Egreso: ${egreso.concepto} (${egreso.proveedor_nombre})`.slice(0, 200);
}

async function create(datos) {
  return withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO egresos (alcance, torre_id, proveedor_id, categoria, concepto, numero_documento, fecha, valor,
                            estado, fecha_pago, comprobante_url, creado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        datos.alcance, datos.torre_id, datos.proveedor_id, datos.categoria, datos.concepto, datos.numero_documento,
        datos.fecha, datos.valor, datos.estado, datos.fecha_pago, datos.comprobante_url, datos.creado_por,
      ]
    );
    const egreso = await findById(result.rows[0].id, client);

    if (egreso.estado === 'pagado') {
      await finanzasModel.registrarEgreso(client, { ...egreso, concepto_finanzas: conceptoFinanzas(egreso), creado_por: datos.creado_por });
    }

    return egreso;
  });
}

// Bloquea el egreso dentro de la transaccion para que dos personas no lo paguen o anulen a la vez.
async function lockEgreso(client, id) {
  const result = await client.query('SELECT id FROM egresos WHERE id = $1 FOR UPDATE', [id]);

  if (!result.rows[0]) {
    throw new HttpError(404, 'Egreso no encontrado');
  }

  return findById(id, client);
}

// assertPermiso(egreso) lanza si el usuario no puede tocarlo; se evalua con el registro bloqueado.
async function pagar(id, { fecha_pago, comprobante_url, user_id, assertPermiso }) {
  return withTransaction(async (client) => {
    const egreso = await lockEgreso(client, id);
    await assertPermiso(egreso);

    if (egreso.estado !== 'pendiente') {
      throw new HttpError(409, `El egreso ya esta ${egreso.estado}`);
    }

    await client.query(
      `UPDATE egresos
       SET estado = 'pagado', fecha_pago = $2, comprobante_url = COALESCE($3, comprobante_url), updated_at = NOW()
       WHERE id = $1`,
      [id, fecha_pago, comprobante_url]
    );

    const pagado = await findById(id, client);
    await finanzasModel.registrarEgreso(client, { ...pagado, concepto_finanzas: conceptoFinanzas(pagado), creado_por: user_id });
    return pagado;
  });
}

async function anular(id, { motivo, user_id, assertPermiso }) {
  return withTransaction(async (client) => {
    const egreso = await lockEgreso(client, id);
    await assertPermiso(egreso);

    if (egreso.estado === 'anulado') {
      throw new HttpError(409, 'El egreso ya esta anulado');
    }

    await client.query(
      `UPDATE egresos
       SET estado = 'anulado', motivo_anulacion = $2, anulado_por = $3, anulado_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [id, motivo, user_id]
    );
    await finanzasModel.quitarPorOrigen(client, 'egreso', id);

    return findById(id, client);
  });
}

// Suma de egresos por categoria en un anio: ejecutado (pagados, por fecha de pago) y comprometido (pendientes).
async function totalesPorCategoria({ anio, alcance, torre_id }) {
  const result = await pool.query(
    `SELECT categoria,
            COALESCE(SUM(valor) FILTER (WHERE estado = 'pagado' AND EXTRACT(YEAR FROM fecha_pago) = $1), 0) AS ejecutado,
            COALESCE(SUM(valor) FILTER (WHERE estado = 'pendiente' AND EXTRACT(YEAR FROM fecha) = $1), 0) AS comprometido
     FROM egresos
     WHERE alcance = $2 AND torre_id IS NOT DISTINCT FROM $3
     GROUP BY categoria`,
    [anio, alcance, torre_id]
  );

  return result.rows;
}

module.exports = {
  findAll,
  findById,
  create,
  pagar,
  anular,
  totalesPorCategoria,
};
