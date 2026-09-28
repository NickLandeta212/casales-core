const { pool } = require('../config/database');
const finanzasModel = require('./finanzas.model');

// Valor usado solo si no existe ningun registro en alicuota_valores.
const DEFAULT_MONTHLY_VALUE = 45;

function normalizeIds(ids) {
  return Array.isArray(ids)
    ? ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
    : [];
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function withTransaction(work) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Bloquea un pago en revision; opcionalmente restringido a ciertas torres.
async function lockPagoEnRevision(client, table, id, torreIds = []) {
  const values = [id];
  let torreFilter = '';

  if (torreIds.length > 0) {
    values.push(torreIds);
    torreFilter = 'AND torre_id = ANY($2::int[])';
  }

  const result = await client.query(`SELECT estado FROM ${table} WHERE id = $1 ${torreFilter} FOR UPDATE`, values);

  if (result.rowCount === 0) {
    throw httpError(404, 'Pago de alicuota no encontrado');
  }

  if (result.rows[0].estado !== 'en_revision') {
    throw httpError(409, `El pago ya fue ${result.rows[0].estado === 'aprobado' ? 'aprobado' : 'rechazado'}`);
  }
}

function getCurrentYear() {
  return new Date().getFullYear();
}

async function findDepartamentosByTorre(torreId) {
  const result = await pool.query(
    `SELECT d.id,
            d.numero,
            d.torre_id,
            t.numero AS torre_numero
     FROM departamentos d
     INNER JOIN torres t ON t.id = d.torre_id
     WHERE d.torre_id = $1
     ORDER BY CASE
                WHEN d.numero ~ '^T[0-9]+SS' THEN 1
                WHEN d.numero ~ '^T[0-9]+PB' THEN 2
                WHEN d.numero ~ '^T[0-9]+D' THEN 3
                ELSE 99
              END ASC,
              d.numero ASC,
              d.id ASC`,
    [torreId]
  );

  return result.rows;
}

// Valor vigente: el definido para el anio mas reciente <= anio; a igual anio, el de la torre gana al general.
async function getValorVigente(torre_id, anio, db = pool) {
  const result = await db.query(
    `SELECT valor
     FROM alicuota_valores
     WHERE (torre_id = $1 OR torre_id IS NULL)
       AND anio <= $2
     ORDER BY anio DESC, (torre_id IS NULL) ASC
     LIMIT 1`,
    [torre_id, anio]
  );

  return result.rows[0] ? Number(result.rows[0].valor) : DEFAULT_MONTHLY_VALUE;
}

async function findValores() {
  const result = await pool.query(
    `SELECT v.id, v.torre_id, t.numero AS torre_numero, v.anio, v.valor, v.updated_at, u.nombre AS updated_by_nombre
     FROM alicuota_valores v
     LEFT JOIN torres t ON t.id = v.torre_id
     LEFT JOIN usuarios u ON u.id = v.updated_by
     ORDER BY v.anio DESC, t.numero ASC NULLS FIRST`
  );

  return result.rows;
}

async function upsertValor({ torre_id, anio, valor, user_id }) {
  const result = await pool.query(
    `INSERT INTO alicuota_valores (torre_id, anio, valor, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (COALESCE(torre_id, 0), anio)
     DO UPDATE SET valor = EXCLUDED.valor, updated_by = EXCLUDED.updated_by, updated_at = NOW()
     RETURNING *`,
    [torre_id, anio, valor, user_id || null]
  );

  return result.rows[0];
}

async function removeValor(id) {
  const result = await pool.query('DELETE FROM alicuota_valores WHERE id = $1 RETURNING *', [id]);
  return result.rows[0] || null;
}

async function findMesesByDepartamento({ torre_id, departamento_id, anio = getCurrentYear() }) {
  const valorVigente = await getValorVigente(torre_id, anio);
  const result = await pool.query(
    `WITH meses AS (
       SELECT generate_series(1, 12) AS mes
     )
     SELECT p.id,
            $1::int AS torre_id,
            t.numero AS torre_numero,
            d.id AS departamento_id,
            d.numero AS departamento_numero,
            $3::int AS anio,
            meses.mes,
            COALESCE(p.descripcion, 'Alicuota mes ' || meses.mes) AS descripcion,
            COALESCE(p.valor, $4::numeric) AS valor,
            COALESCE(p.estado, 'pendiente') AS estado,
            p.fecha_pago,
            p.comprobante_url,
            p.comprobante_nombre,
            p.email_destinatario,
            p.motivo_rechazo,
            p.aprobado_at,
            p.created_at,
            p.updated_at
     FROM meses
     INNER JOIN departamentos d ON d.id = $2 AND d.torre_id = $1
     INNER JOIN torres t ON t.id = d.torre_id
     LEFT JOIN pagos_alicuotas p
       ON p.departamento_id = d.id
      AND p.anio = $3
      AND p.mes = meses.mes
     ORDER BY meses.mes ASC`,
    [torre_id, departamento_id, anio, valorVigente]
  );

  return result.rows;
}

// Registra el pago de uno o varios meses con un mismo comprobante (portal Mi cuenta).
// Todo o nada: si un mes ya esta aprobado o en revision, no se registra ninguno.
async function createPagoMeses({ departamento_id, anio, meses, comprobante_url, comprobante_nombre, email_destinatario }) {
  return withTransaction(async (client) => {
    const departamento = await client.query('SELECT id, torre_id FROM departamentos WHERE id = $1', [departamento_id]);

    if (departamento.rowCount === 0) {
      throw httpError(404, 'Departamento no encontrado');
    }

    const torreId = departamento.rows[0].torre_id;
    const valor = await getValorVigente(torreId, anio, client);
    const existentes = await client.query(
      `SELECT mes, estado FROM pagos_alicuotas
       WHERE departamento_id = $1 AND anio = $2 AND mes = ANY($3::int[])
       FOR UPDATE`,
      [departamento_id, anio, meses]
    );
    const bloqueado = existentes.rows.find((row) => row.estado === 'aprobado' || row.estado === 'en_revision');

    if (bloqueado) {
      throw httpError(409, `El mes ${bloqueado.mes}/${anio} ya esta ${bloqueado.estado === 'aprobado' ? 'pagado' : 'en revision'}`);
    }

    const pagos = [];

    for (const mes of meses) {
      const result = await client.query(
        `INSERT INTO pagos_alicuotas (
           torre_id, departamento_id, anio, mes, descripcion, valor, comprobante_url, comprobante_nombre, email_destinatario, estado
         )
         VALUES ($1, $2, $3, $4, 'Alicuota mes ' || $4::int::text, $5, $6, $7, $8, 'en_revision')
         ON CONFLICT (departamento_id, anio, mes)
         DO UPDATE SET valor = EXCLUDED.valor,
                       comprobante_url = EXCLUDED.comprobante_url,
                       comprobante_nombre = EXCLUDED.comprobante_nombre,
                       email_destinatario = EXCLUDED.email_destinatario,
                       estado = 'en_revision',
                       fecha_pago = NOW(),
                       aprobado_por = NULL,
                       aprobado_at = NULL,
                       motivo_rechazo = NULL,
                       updated_at = NOW()
         RETURNING *`,
        [torreId, departamento_id, anio, mes, valor, comprobante_url, comprobante_nombre, email_destinatario]
      );
      pagos.push(result.rows[0]);
    }

    return pagos;
  });
}

async function findPagos({ torre_ids, torre_id }) {
  const ids = normalizeIds(torre_ids);
  const values = [];
  const filters = [];

  if (ids.length > 0) {
    values.push(ids);
    filters.push(`p.torre_id = ANY($${values.length}::int[])`);
  }

  if (torre_id) {
    values.push(Number(torre_id));
    filters.push(`p.torre_id = $${values.length}`);
  }

  const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
  const result = await pool.query(
    `SELECT p.*,
            t.numero AS torre_numero,
            d.numero AS departamento_numero,
            p.email_destinatario,
            u.nombre AS aprobado_por_nombre
     FROM pagos_alicuotas p
     INNER JOIN torres t ON t.id = p.torre_id
     INNER JOIN departamentos d ON d.id = p.departamento_id
     LEFT JOIN usuarios u ON u.id = p.aprobado_por
     ${where}
     ORDER BY p.fecha_pago DESC, p.id DESC`,
    values
  );

  return result.rows;
}

// beforeCommit se ejecuta dentro de la transaccion (ej. enviar la factura):
// si falla, la aprobacion se revierte por completo.
async function approvePago(id, { user_id, torre_ids, beforeCommit }) {
  return withTransaction(async (client) => {
    await lockPagoEnRevision(client, 'pagos_alicuotas', id, normalizeIds(torre_ids));

    const result = await client.query(
      `UPDATE pagos_alicuotas
       SET estado = 'aprobado', aprobado_por = $2, aprobado_at = NOW(), motivo_rechazo = NULL, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, user_id || null]
    );
    const pago = result.rows[0];
    const departamento = await client.query('SELECT numero FROM departamentos WHERE id = $1', [pago.departamento_id]);

    await finanzasModel.registrarPagoAprobado(client, [{
      concepto: `Alicuota ${pago.mes}/${pago.anio} - ${departamento.rows[0].numero}`,
      tipo: 'ingreso',
      valor: pago.valor,
      alcance: 'torre',
      torre_id: pago.torre_id,
      creado_por: user_id,
      origen: 'pago_alicuota',
      origen_id: pago.id,
    }]);

    if (beforeCommit) {
      await beforeCommit(result.rows[0]);
    }

    return result.rows[0];
  });
}

async function rejectPago(id, { user_id, torre_ids, motivo }) {
  return withTransaction(async (client) => {
    await lockPagoEnRevision(client, 'pagos_alicuotas', id, normalizeIds(torre_ids));

    const result = await client.query(
      `UPDATE pagos_alicuotas
       SET estado = 'rechazado', aprobado_por = $2, aprobado_at = NULL, motivo_rechazo = $3, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, user_id || null, motivo]
    );

    return result.rows[0];
  });
}

async function findPagoById(id) {
  const result = await pool.query(
    `SELECT p.*,
            t.numero AS torre_numero,
            d.numero AS departamento_numero,
            u.nombre AS usuario_nombre,
            u.email AS usuario_email,
            p.email_destinatario
     FROM pagos_alicuotas p
     INNER JOIN torres t ON t.id = p.torre_id
     INNER JOIN departamentos d ON d.id = p.departamento_id
     LEFT JOIN usuarios u ON u.id = d.usuario_id
     WHERE p.id = $1
     LIMIT 1`,
    [id]
  );

  return result.rows[0] || null;
}

async function findPagoByIdForDepartamento(id, departamento_id) {
  const pago = await findPagoById(id);
  return pago && pago.departamento_id === departamento_id ? pago : null;
}

async function findMesesByTorre({ torre_id, anio = getCurrentYear() }) {
  const result = await pool.query(
    `WITH meses AS (
       SELECT generate_series(1, 12) AS mes
     )
     SELECT p.id,
            t.id AS torre_id,
            t.numero AS torre_numero,
            $2::int AS anio,
            meses.mes,
            COALESCE(p.descripcion, 'Alicuota torre mes ' || meses.mes) AS descripcion,
            COALESCE(p.valor, 0) AS valor,
            COALESCE(p.estado, 'pendiente') AS estado,
            p.fecha_pago,
            p.comprobante_url,
            p.comprobante_nombre,
            p.motivo_rechazo,
            p.aprobado_at,
            p.created_at,
            p.updated_at
     FROM meses
     INNER JOIN torres t ON t.id = $1
     LEFT JOIN pagos_alicuotas_torres p
       ON p.torre_id = t.id
      AND p.anio = $2
      AND p.mes = meses.mes
     ORDER BY meses.mes ASC`,
    [torre_id, anio]
  );

  return result.rows;
}

async function createPagoTorre({ torre_id, anio = getCurrentYear(), mes, valor, comprobante_url, comprobante_nombre }) {
  const existing = await pool.query(
    `SELECT id, estado
     FROM pagos_alicuotas_torres
     WHERE torre_id = $1
       AND anio = $2
       AND mes = $3`,
    [torre_id, anio, mes]
  );

  if (existing.rows[0]?.estado === 'aprobado') {
    throw httpError(400, 'Esta alicuota de torre ya fue aprobada');
  }

  if (existing.rows[0]?.estado === 'en_revision') {
    throw httpError(409, 'Ya existe un comprobante en revision para este mes');
  }

  const result = await pool.query(
    `INSERT INTO pagos_alicuotas_torres (
       torre_id, anio, mes, descripcion, valor, comprobante_url, comprobante_nombre, estado
     )
     SELECT t.id,
            $2::int,
            $3::int,
            'Alicuota torre mes ' || $3::int::text,
            $6,
            $4,
            $5,
            'en_revision'
     FROM torres t
     WHERE t.id = $1
     ON CONFLICT (torre_id, anio, mes)
     DO UPDATE SET valor = EXCLUDED.valor,
                   comprobante_url = EXCLUDED.comprobante_url,
                   comprobante_nombre = EXCLUDED.comprobante_nombre,
                   estado = 'en_revision',
                   fecha_pago = NOW(),
                   aprobado_por = NULL,
                   aprobado_at = NULL,
                   motivo_rechazo = NULL,
                   updated_at = NOW()
     RETURNING *`,
    [torre_id, anio, mes, comprobante_url, comprobante_nombre, Number(valor || 0)]
  );

  return result.rows[0] || null;
}

async function findPagosTorres({ torre_id }) {
  const values = [];
  const filters = [];

  if (torre_id) {
    values.push(Number(torre_id));
    filters.push(`p.torre_id = $${values.length}`);
  }

  const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
  const result = await pool.query(
    `SELECT p.*,
            t.numero AS torre_numero,
            u.nombre AS aprobado_por_nombre
     FROM pagos_alicuotas_torres p
     INNER JOIN torres t ON t.id = p.torre_id
     LEFT JOIN usuarios u ON u.id = p.aprobado_por
     ${where}
     ORDER BY p.fecha_pago DESC, p.id DESC`,
    values
  );

  return result.rows;
}

async function approvePagoTorre(id, { user_id }) {
  return withTransaction(async (client) => {
    await lockPagoEnRevision(client, 'pagos_alicuotas_torres', id);

    const result = await client.query(
      `UPDATE pagos_alicuotas_torres p
       SET estado = 'aprobado', aprobado_por = $2, aprobado_at = NOW(), motivo_rechazo = NULL, updated_at = NOW()
       FROM torres t
       WHERE p.id = $1 AND t.id = p.torre_id
       RETURNING p.*, t.numero AS torre_numero`,
      [id, user_id || null]
    );
    const pago = result.rows[0];

    // La torre entrega el dinero al conjunto: ingreso del conjunto y gasto de la torre.
    await finanzasModel.registrarPagoAprobado(client, [
      {
        concepto: `Alicuota Torre ${pago.torre_numero} - ${pago.mes}/${pago.anio}`,
        tipo: 'ingreso',
        valor: pago.valor,
        alcance: 'conjunto',
        torre_id: null,
        creado_por: user_id,
        origen: 'pago_torre',
        origen_id: pago.id,
      },
      {
        concepto: `Alicuota pagada al conjunto - ${pago.mes}/${pago.anio}`,
        tipo: 'gasto',
        valor: pago.valor,
        alcance: 'torre',
        torre_id: pago.torre_id,
        creado_por: user_id,
        origen: 'pago_torre',
        origen_id: pago.id,
      },
    ]);

    return result.rows[0];
  });
}

async function rejectPagoTorre(id, { user_id, motivo }) {
  return withTransaction(async (client) => {
    await lockPagoEnRevision(client, 'pagos_alicuotas_torres', id);

    const result = await client.query(
      `UPDATE pagos_alicuotas_torres
       SET estado = 'rechazado', aprobado_por = $2, aprobado_at = NULL, motivo_rechazo = $3, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, user_id || null, motivo]
    );

    return result.rows[0];
  });
}

module.exports = {
  getValorVigente,
  findValores,
  upsertValor,
  removeValor,
  findDepartamentosByTorre,
  findMesesByDepartamento,
  createPagoMeses,
  findPagoByIdForDepartamento,
  findPagos,
  approvePago,
  rejectPago,
  findPagoById,
  findMesesByTorre,
  createPagoTorre,
  findPagosTorres,
  approvePagoTorre,
  rejectPagoTorre,
  getCurrentYear,
};
