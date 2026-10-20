const { pool, withTransaction } = require('../config/database');
const HttpError = require('../utils/httpError');
const { normalizeIds } = require('../utils/validators');
const finanzasModel = require('./finanzas.model');

// Ciclo de vida de una multa: pendiente -> en_pago (comprobante enviado) -> pagada (pago aprobado).
// Si el pago se rechaza, la multa vuelve a pendiente.

const MULTA_SELECT = `
  SELECT m.*,
         m.id AS numero_consecutivo,
         mo.nombre AS motivo_nombre,
         d.numero AS departamento_numero,
         t.numero AS torre_numero
  FROM multas m
  INNER JOIN departamentos d ON d.id = m.departamento_id
  INNER JOIN torres t ON t.id = d.torre_id
  INNER JOIN motivos_multa mo ON mo.id = m.motivo_id`;

// Cada pago incluye el detalle de sus multas en una sola consulta.
const PAGO_SELECT = `
  SELECT p.*,
         d.numero AS departamento_numero,
         t.numero AS torre_numero,
         COALESCE(detalle.multas, '[]'::json) AS multas
  FROM pagos_multas p
  INNER JOIN departamentos d ON d.id = p.departamento_id
  INNER JOIN torres t ON t.id = d.torre_id
  LEFT JOIN LATERAL (
    SELECT json_agg(json_build_object(
             'multa_id', pmd.multa_id,
             'monto', pmd.monto,
             'descripcion', COALESCE(pmd.descripcion, m.descripcion),
             'persona_nombre', COALESCE(pmd.persona_nombre, m.persona_nombre),
             'persona_apellidos', COALESCE(pmd.persona_apellidos, m.persona_apellidos),
             'motivo_nombre', COALESCE(pmd.motivo_nombre, mm.nombre)
           ) ORDER BY pmd.id) AS multas
    FROM pagos_multas_detalle pmd
    LEFT JOIN multas m ON m.id = pmd.multa_id
    LEFT JOIN motivos_multa mm ON mm.id = m.motivo_id
    WHERE pmd.pago_multa_id = p.id
  ) detalle ON TRUE`;

// Todas las consultas de multas y de pagos comparten SELECT y orden; solo cambia el filtro.
async function queryMultas(where = '', values = []) {
  const result = await pool.query(`${MULTA_SELECT} ${where} ORDER BY m.id ASC`, values);
  return result.rows;
}

async function queryPagos(where = '', values = []) {
  const result = await pool.query(`${PAGO_SELECT} ${where} ORDER BY p.created_at DESC`, values);
  return result.rows;
}

function findAll() {
  return queryMultas();
}

async function findAllByTorreIds(torre_ids) {
  const ids = normalizeIds(torre_ids);
  return ids.length > 0 ? queryMultas('WHERE d.torre_id = ANY($1::int[])', [ids]) : [];
}

function findAllByUsuarioId(usuario_id) {
  return queryMultas('WHERE d.usuario_id = $1', [usuario_id]);
}

function findAllByDepartamento(departamento_id) {
  return queryMultas('WHERE m.departamento_id = $1', [departamento_id]);
}

async function findById(id) {
  const [multa] = await queryMultas('WHERE m.id = $1', [id]);
  return multa || null;
}

async function findByIdForTorreIds(id, torre_ids) {
  const ids = normalizeIds(torre_ids);

  if (ids.length === 0) {
    return null;
  }

  const [multa] = await queryMultas('WHERE m.id = $1 AND d.torre_id = ANY($2::int[])', [id, ids]);
  return multa || null;
}

async function findByIdForUsuario(id, usuario_id) {
  const [multa] = await queryMultas('WHERE m.id = $1 AND d.usuario_id = $2', [id, usuario_id]);
  return multa || null;
}

async function findMotivos() {
  const result = await pool.query('SELECT id, nombre FROM motivos_multa ORDER BY nombre ASC');
  return result.rows;
}

async function isDepartamentoInTorreIds(departamento_id, torre_ids) {
  const ids = normalizeIds(torre_ids);

  if (ids.length === 0) {
    return false;
  }

  const result = await pool.query(
    'SELECT id FROM departamentos WHERE id = $1 AND torre_id = ANY($2::int[]) LIMIT 1',
    [departamento_id, ids]
  );

  return result.rowCount > 0;
}

async function ensureDepartamentoYMotivo(client, departamento_id, motivo_id) {
  const departamento = await client.query('SELECT id FROM departamentos WHERE id = $1', [departamento_id]);

  if (departamento.rowCount === 0) {
    throw new HttpError(404, 'Departamento no encontrado');
  }

  const motivo = await client.query('SELECT id FROM motivos_multa WHERE id = $1', [motivo_id]);

  if (motivo.rowCount === 0) {
    throw new HttpError(404, 'Motivo no encontrado');
  }
}

async function create({ departamento_id, motivo_id, persona_nombre, persona_apellidos, persona_cedula, descripcion, monto, aprobada, fecha }) {
  const id = await withTransaction(async (client) => {
    await ensureDepartamentoYMotivo(client, departamento_id, motivo_id);

    const inserted = await client.query(
      `INSERT INTO multas (departamento_id, motivo_id, persona_nombre, persona_apellidos, persona_cedula, descripcion, monto, aprobada, fecha)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [departamento_id, motivo_id, persona_nombre, persona_apellidos, persona_cedula, descripcion, monto, Boolean(aprobada), fecha || new Date()]
    );

    return inserted.rows[0].id;
  });

  return findById(id);
}

async function update(id, { departamento_id, motivo_id, persona_nombre, persona_apellidos, persona_cedula, descripcion, monto, aprobada, fecha }) {
  const updated = await withTransaction(async (client) => {
    const existing = await client.query('SELECT estado FROM multas WHERE id = $1 FOR UPDATE', [id]);

    if (existing.rowCount === 0) {
      return false;
    }

    if (existing.rows[0].estado !== 'pendiente') {
      throw new HttpError(409, 'No se puede modificar una multa que ya tiene un pago enviado o aprobado');
    }

    await ensureDepartamentoYMotivo(client, departamento_id, motivo_id);

    await client.query(
      `UPDATE multas
       SET departamento_id = $1,
           motivo_id = $2,
           persona_nombre = $3,
           persona_apellidos = $4,
           persona_cedula = $5,
           descripcion = $6,
           monto = $7,
           aprobada = $8,
           fecha = $9
       WHERE id = $10`,
      [departamento_id, motivo_id, persona_nombre, persona_apellidos, persona_cedula, descripcion, monto, Boolean(aprobada), fecha || new Date(), id]
    );

    return true;
  });

  return updated ? findById(id) : null;
}

async function remove(id) {
  const existing = await pool.query('SELECT estado FROM multas WHERE id = $1', [id]);

  if (existing.rowCount === 0) {
    return null;
  }

  if (existing.rows[0].estado !== 'pendiente') {
    throw new HttpError(409, 'No se puede eliminar una multa que ya tiene un pago enviado o aprobado');
  }

  const result = await pool.query(`DELETE FROM multas WHERE id = $1 AND estado = 'pendiente' RETURNING *`, [id]);
  return result.rows[0] || null;
}

async function createPago({ departamento_id, multa_ids, total, comprobante_url, email_destinatario }) {
  const pagoId = await withTransaction(async (client) => {
    const departamento = await client.query('SELECT id FROM departamentos WHERE id = $1', [departamento_id]);

    if (departamento.rowCount === 0) {
      throw new HttpError(404, 'Departamento no encontrado');
    }

    const multasResult = await client.query(
      `SELECT m.id, m.monto, m.estado, m.descripcion, m.persona_nombre, m.persona_apellidos, mm.nombre AS motivo_nombre
       FROM multas m
       INNER JOIN motivos_multa mm ON mm.id = m.motivo_id
       WHERE m.departamento_id = $1
         AND m.id = ANY($2::bigint[])
       ORDER BY m.id ASC
       FOR UPDATE OF m`,
      [departamento_id, multa_ids]
    );

    if (multasResult.rowCount !== multa_ids.length) {
      throw new HttpError(400, 'Una o mas multas no pertenecen al departamento seleccionado');
    }

    if (multasResult.rows.some((multa) => multa.estado !== 'pendiente')) {
      throw new HttpError(409, 'Una o mas multas ya tienen un pago en revision o fueron pagadas');
    }

    const realTotal = multasResult.rows.reduce((sum, multa) => sum + Number(multa.monto || 0), 0);

    if (Number(total).toFixed(2) !== realTotal.toFixed(2)) {
      throw new HttpError(400, 'El total enviado no coincide con las multas seleccionadas');
    }

    const pagoResult = await client.query(
      `INSERT INTO pagos_multas (departamento_id, total, comprobante_url, email_destinatario, estado)
       VALUES ($1, $2, $3, $4, 'en_proceso')
       RETURNING id`,
      [departamento_id, realTotal, comprobante_url, email_destinatario]
    );

    const id = pagoResult.rows[0].id;

    // El detalle copia los datos de cada multa (ya bloqueadas arriba) en una sola consulta.
    await client.query(
      `INSERT INTO pagos_multas_detalle
         (pago_multa_id, multa_id, monto, descripcion, persona_nombre, persona_apellidos, motivo_nombre)
       SELECT $1, m.id, m.monto, m.descripcion, m.persona_nombre, m.persona_apellidos, mm.nombre
       FROM multas m
       INNER JOIN motivos_multa mm ON mm.id = m.motivo_id
       WHERE m.id = ANY($2::bigint[])
       ORDER BY m.id ASC`,
      [id, multa_ids]
    );

    await client.query(`UPDATE multas SET estado = 'en_pago' WHERE id = ANY($1::bigint[])`, [multa_ids]);

    return id;
  });

  return findPagoById(pagoId);
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

async function findPagoByIdForTorreIds(id, torre_ids) {
  const ids = normalizeIds(torre_ids);

  if (ids.length === 0) {
    return null;
  }

  const [pago] = await queryPagos('WHERE p.id = $1 AND d.torre_id = ANY($2::int[])', [id, ids]);
  return pago || null;
}

async function lockPagoEnProceso(client, id) {
  const pago = await client.query('SELECT estado FROM pagos_multas WHERE id = $1 FOR UPDATE', [id]);

  if (pago.rowCount === 0) {
    throw new HttpError(404, 'Pago de multas no encontrado');
  }

  if (pago.rows[0].estado !== 'en_proceso') {
    throw new HttpError(409, `El pago ya fue ${pago.rows[0].estado === 'aprobado' ? 'aprobado' : 'rechazado'}`);
  }
}

// beforeCommit se ejecuta dentro de la transaccion (ej. enviar la factura):
// si falla, la aprobacion se revierte por completo.
async function approvePago(id, { user_id, beforeCommit }) {
  await withTransaction(async (client) => {
    await lockPagoEnProceso(client, id);

    await client.query(
      `UPDATE multas
       SET estado = 'pagada'
       WHERE id IN (SELECT multa_id FROM pagos_multas_detalle WHERE pago_multa_id = $1 AND multa_id IS NOT NULL)`,
      [id]
    );

    const aprobado = await client.query(
      `UPDATE pagos_multas p
       SET estado = 'aprobado', revisado_por = $2, revisado_at = NOW(), motivo_rechazo = NULL, updated_at = NOW()
       FROM departamentos d
       WHERE p.id = $1 AND d.id = p.departamento_id
       RETURNING p.total, d.torre_id, d.numero AS departamento_numero`,
      [id, user_id || null]
    );
    const { total, torre_id, departamento_numero } = aprobado.rows[0];

    await finanzasModel.registrarPagoAprobado(client, [{
      concepto: `Pago de multas #${id} - ${departamento_numero}`,
      tipo: 'ingreso',
      valor: total,
      alcance: 'torre',
      torre_id,
      creado_por: user_id,
      origen: 'pago_multa',
      origen_id: id,
    }]);

    if (beforeCommit) {
      await beforeCommit();
    }
  });

  return findPagoById(id);
}

async function rejectPago(id, { user_id, motivo }) {
  await withTransaction(async (client) => {
    await lockPagoEnProceso(client, id);

    // Las multas vuelven a quedar disponibles para un nuevo pago.
    await client.query(
      `UPDATE multas
       SET estado = 'pendiente'
       WHERE estado = 'en_pago'
         AND id IN (SELECT multa_id FROM pagos_multas_detalle WHERE pago_multa_id = $1 AND multa_id IS NOT NULL)`,
      [id]
    );

    await client.query(
      `UPDATE pagos_multas
       SET estado = 'rechazado', revisado_por = $2, revisado_at = NOW(), motivo_rechazo = $3, updated_at = NOW()
       WHERE id = $1`,
      [id, user_id || null, motivo]
    );
  });

  return findPagoById(id);
}

module.exports = {
  findAll,
  findAllByTorreIds,
  findById,
  findByIdForTorreIds,
  findAllByUsuarioId,
  findAllByDepartamento,
  findByIdForUsuario,
  findMotivos,
  isDepartamentoInTorreIds,
  create,
  update,
  remove,
  createPago,
  findPagoById,
  findPagosByTorreIds,
  findPagoByIdForTorreIds,
  findPagosByDepartamento,
  approvePago,
  rejectPago,
};
