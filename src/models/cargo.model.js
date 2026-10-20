const { pool, withTransaction } = require('../config/database');
const HttpError = require('../utils/httpError');
const { normalizeIds } = require('../utils/validators');
const finanzasModel = require('./finanzas.model');

// Cargos extraordinarios: la administracion emite un cargo del mes para todos los departamentos
// (o los de una torre). Cada departamento recibe su cargo: pendiente -> en_pago -> pagado.
// Revertir la emision anula los cargos, siempre que ninguno tenga un pago enviado o aprobado.

const EMISION_SELECT = `
  SELECT e.*,
         t.numero AS torre_numero,
         uc.nombre AS creado_por_nombre,
         ur.nombre AS revertido_por_nombre,
         COUNT(c.id)::int AS departamentos,
         COUNT(c.id) FILTER (WHERE c.estado = 'pendiente')::int AS pendientes,
         COUNT(c.id) FILTER (WHERE c.estado = 'en_pago')::int AS en_pago,
         COUNT(c.id) FILTER (WHERE c.estado = 'pagado')::int AS pagados,
         COALESCE(SUM(c.valor) FILTER (WHERE c.estado = 'pagado'), 0) AS total_recaudado
  FROM cargos_emisiones e
  LEFT JOIN torres t ON t.id = e.torre_id
  LEFT JOIN usuarios uc ON uc.id = e.creado_por
  LEFT JOIN usuarios ur ON ur.id = e.revertido_por
  LEFT JOIN cargos c ON c.emision_id = e.id`;

const EMISION_GROUP = 'GROUP BY e.id, t.numero, uc.nombre, ur.nombre';

const CARGO_SELECT = `
  SELECT c.id, c.emision_id, c.departamento_id, c.valor, c.estado, c.created_at,
         e.anio, e.mes, e.concepto
  FROM cargos c
  INNER JOIN cargos_emisiones e ON e.id = c.emision_id`;

const PAGO_SELECT = `
  SELECT p.*,
         d.numero AS departamento_numero,
         d.torre_id,
         t.numero AS torre_numero,
         COALESCE(detalle.cargos, '[]'::json) AS cargos
  FROM pagos_cargos p
  INNER JOIN departamentos d ON d.id = p.departamento_id
  INNER JOIN torres t ON t.id = d.torre_id
  LEFT JOIN LATERAL (
    SELECT json_agg(json_build_object(
             'cargo_id', pcd.cargo_id,
             'monto', pcd.monto,
             'concepto', e.concepto,
             'anio', e.anio,
             'mes', e.mes
           ) ORDER BY pcd.id) AS cargos
    FROM pagos_cargos_detalle pcd
    INNER JOIN cargos c ON c.id = pcd.cargo_id
    INNER JOIN cargos_emisiones e ON e.id = c.emision_id
    WHERE pcd.pago_cargo_id = p.id
  ) detalle ON TRUE`;

// torre_ids null = todas. Con torre_ids se incluyen tambien las emisiones para todas las torres.
async function findEmisiones({ torre_ids = null } = {}) {
  const values = [];
  let where = '';

  if (Array.isArray(torre_ids)) {
    values.push(normalizeIds(torre_ids));
    where = 'WHERE e.torre_id IS NULL OR e.torre_id = ANY($1::int[])';
  }

  const result = await pool.query(
    `${EMISION_SELECT} ${where} ${EMISION_GROUP} ORDER BY e.anio DESC, e.mes DESC, e.id DESC`,
    values
  );

  return result.rows;
}

async function findEmisionById(id, db = pool) {
  const result = await db.query(`${EMISION_SELECT} WHERE e.id = $1 ${EMISION_GROUP}`, [id]);
  return result.rows[0] || null;
}

async function createEmision({ anio, mes, concepto, valor, torre_id, user_id }) {
  const id = await withTransaction(async (client) => {
    if (torre_id) {
      const torre = await client.query('SELECT id FROM torres WHERE id = $1', [torre_id]);

      if (torre.rowCount === 0) {
        throw new HttpError(404, 'Torre no encontrada');
      }
    }

    // Evita emitir dos veces el mismo cargo por error (mismo periodo, concepto y alcance).
    const duplicada = await client.query(
      `SELECT id FROM cargos_emisiones
       WHERE estado = 'activa' AND anio = $1 AND mes = $2
         AND LOWER(concepto) = LOWER($3) AND COALESCE(torre_id, 0) = COALESCE($4::int, 0)
       LIMIT 1`,
      [anio, mes, concepto, torre_id]
    );

    if (duplicada.rowCount > 0) {
      throw new HttpError(409, 'Ya existe un cargo activo con ese concepto para el mismo mes y alcance');
    }

    const emision = await client.query(
      `INSERT INTO cargos_emisiones (anio, mes, concepto, valor, torre_id, creado_por)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [anio, mes, concepto, valor, torre_id, user_id || null]
    );
    const emisionId = emision.rows[0].id;

    const cargos = await client.query(
      `INSERT INTO cargos (emision_id, departamento_id, valor)
       SELECT $1, d.id, $2
       FROM departamentos d
       WHERE $3::int IS NULL OR d.torre_id = $3::int`,
      [emisionId, valor, torre_id]
    );

    if (cargos.rowCount === 0) {
      throw new HttpError(400, 'No hay departamentos registrados para emitir el cargo');
    }

    return emisionId;
  });

  return findEmisionById(id);
}

async function revertirEmision(id, { user_id, motivo }) {
  await withTransaction(async (client) => {
    const emision = await client.query('SELECT estado FROM cargos_emisiones WHERE id = $1 FOR UPDATE', [id]);

    if (emision.rowCount === 0) {
      throw new HttpError(404, 'Cargo no encontrado');
    }

    if (emision.rows[0].estado === 'revertida') {
      throw new HttpError(409, 'Este cargo ya fue revertido');
    }

    const cargos = await client.query(
      `SELECT estado FROM cargos WHERE emision_id = $1 FOR UPDATE`,
      [id]
    );
    const conPago = cargos.rows.filter((cargo) => cargo.estado === 'en_pago' || cargo.estado === 'pagado').length;

    if (conPago > 0) {
      throw new HttpError(
        409,
        `No se puede revertir: ${conPago} departamento(s) ya enviaron o tienen aprobado el pago de este cargo`
      );
    }

    await client.query(`UPDATE cargos SET estado = 'anulado' WHERE emision_id = $1`, [id]);
    await client.query(
      `UPDATE cargos_emisiones
       SET estado = 'revertida', motivo_reversion = $2, revertido_por = $3, revertido_at = NOW()
       WHERE id = $1`,
      [id, motivo, user_id || null]
    );
  });

  return findEmisionById(id);
}

async function findCargosByDepartamento(departamento_id) {
  const result = await pool.query(
    `${CARGO_SELECT} WHERE c.departamento_id = $1 ORDER BY e.anio DESC, e.mes DESC, c.id DESC`,
    [departamento_id]
  );

  return result.rows;
}

async function queryPagos(where = '', values = []) {
  const result = await pool.query(`${PAGO_SELECT} ${where} ORDER BY p.created_at DESC`, values);
  return result.rows;
}

async function findPagoById(id) {
  const [pago] = await queryPagos('WHERE p.id = $1', [id]);
  return pago || null;
}

async function findPagosByTorreIds(torre_ids) {
  const ids = normalizeIds(torre_ids);
  return ids.length > 0 ? queryPagos('WHERE d.torre_id = ANY($1::int[])', [ids]) : [];
}

function findPagosByDepartamento(departamento_id) {
  return queryPagos('WHERE p.departamento_id = $1', [departamento_id]);
}

async function createPago({ departamento_id, cargo_ids, total, comprobante_url, email_destinatario }) {
  const pagoId = await withTransaction(async (client) => {
    const cargos = await client.query(
      `SELECT id, valor, estado FROM cargos
       WHERE departamento_id = $1 AND id = ANY($2::int[])
       ORDER BY id ASC
       FOR UPDATE`,
      [departamento_id, cargo_ids]
    );

    if (cargos.rowCount !== cargo_ids.length) {
      throw new HttpError(400, 'Uno o mas cargos no pertenecen a tu departamento');
    }

    if (cargos.rows.some((cargo) => cargo.estado !== 'pendiente')) {
      throw new HttpError(409, 'Uno o mas cargos ya tienen un pago en revision, fueron pagados o se anularon');
    }

    const realTotal = cargos.rows.reduce((sum, cargo) => sum + Number(cargo.valor), 0);

    if (Number(total).toFixed(2) !== realTotal.toFixed(2)) {
      throw new HttpError(400, 'El total enviado no coincide con los cargos seleccionados');
    }

    const pago = await client.query(
      `INSERT INTO pagos_cargos (departamento_id, total, comprobante_url, email_destinatario)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [departamento_id, realTotal, comprobante_url, email_destinatario]
    );
    const id = pago.rows[0].id;

    await client.query(
      `INSERT INTO pagos_cargos_detalle (pago_cargo_id, cargo_id, monto)
       SELECT $1, c.id, c.valor FROM cargos c WHERE c.id = ANY($2::int[])`,
      [id, cargo_ids]
    );
    await client.query(`UPDATE cargos SET estado = 'en_pago' WHERE id = ANY($1::int[])`, [cargo_ids]);

    return id;
  });

  return findPagoById(pagoId);
}

// Bloquea un pago en proceso que pertenezca a una de las torres del tesorero.
async function lockPagoEnProceso(client, id, torre_ids) {
  const pago = await client.query(
    `SELECT p.estado
     FROM pagos_cargos p
     INNER JOIN departamentos d ON d.id = p.departamento_id
     WHERE p.id = $1 AND d.torre_id = ANY($2::int[])
     FOR UPDATE OF p`,
    [id, normalizeIds(torre_ids)]
  );

  if (pago.rowCount === 0) {
    throw new HttpError(404, 'Pago de cargos no encontrado');
  }

  if (pago.rows[0].estado !== 'en_proceso') {
    throw new HttpError(409, `El pago ya fue ${pago.rows[0].estado === 'aprobado' ? 'aprobado' : 'rechazado'}`);
  }
}

async function approvePago(id, { user_id, torre_ids }) {
  await withTransaction(async (client) => {
    await lockPagoEnProceso(client, id, torre_ids);

    await client.query(
      `UPDATE cargos SET estado = 'pagado'
       WHERE id IN (SELECT cargo_id FROM pagos_cargos_detalle WHERE pago_cargo_id = $1)`,
      [id]
    );

    const aprobado = await client.query(
      `UPDATE pagos_cargos p
       SET estado = 'aprobado', revisado_por = $2, revisado_at = NOW(), motivo_rechazo = NULL, updated_at = NOW()
       FROM departamentos d
       WHERE p.id = $1 AND d.id = p.departamento_id
       RETURNING p.total, d.torre_id, d.numero AS departamento_numero`,
      [id, user_id || null]
    );
    const { total, torre_id, departamento_numero } = aprobado.rows[0];

    await finanzasModel.registrarPagoAprobado(client, [{
      concepto: `Pago de cargos extraordinarios #${id} - ${departamento_numero}`,
      tipo: 'ingreso',
      valor: total,
      alcance: 'torre',
      torre_id,
      creado_por: user_id,
      origen: 'pago_cargo',
      origen_id: id,
    }]);
  });

  return findPagoById(id);
}

async function rejectPago(id, { user_id, torre_ids, motivo }) {
  await withTransaction(async (client) => {
    await lockPagoEnProceso(client, id, torre_ids);

    // Los cargos vuelven a quedar disponibles para un nuevo pago.
    await client.query(
      `UPDATE cargos SET estado = 'pendiente'
       WHERE estado = 'en_pago'
         AND id IN (SELECT cargo_id FROM pagos_cargos_detalle WHERE pago_cargo_id = $1)`,
      [id]
    );
    await client.query(
      `UPDATE pagos_cargos
       SET estado = 'rechazado', revisado_por = $2, revisado_at = NOW(), motivo_rechazo = $3, updated_at = NOW()
       WHERE id = $1`,
      [id, user_id || null, motivo]
    );
  });

  return findPagoById(id);
}

module.exports = {
  findEmisiones,
  findEmisionById,
  createEmision,
  revertirEmision,
  findCargosByDepartamento,
  findPagoById,
  findPagosByTorreIds,
  findPagosByDepartamento,
  createPago,
  approvePago,
  rejectPago,
};
