const { pool } = require('../config/database');

const MONTHLY_VALUE = 45;

function normalizeIds(ids) {
  return Array.isArray(ids)
    ? ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
    : [];
}

function getCurrentYear() {
  return new Date().getFullYear();
}

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pagos_alicuotas (
      id SERIAL PRIMARY KEY,
      torre_id INTEGER NOT NULL REFERENCES torres(id) ON DELETE CASCADE,
      departamento_id INTEGER NOT NULL REFERENCES departamentos(id) ON DELETE CASCADE,
      anio INTEGER NOT NULL,
      mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
      descripcion TEXT NOT NULL,
      valor NUMERIC(12,2) NOT NULL DEFAULT ${MONTHLY_VALUE},
      comprobante_url TEXT,
      comprobante_nombre TEXT,
      estado VARCHAR(20) NOT NULL DEFAULT 'en_revision',
      fecha_pago TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      aprobado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      aprobado_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (departamento_id, anio, mes)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pagos_alicuotas_torres (
      id SERIAL PRIMARY KEY,
      torre_id INTEGER NOT NULL REFERENCES torres(id) ON DELETE CASCADE,
      anio INTEGER NOT NULL,
      mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
      descripcion TEXT NOT NULL,
      valor NUMERIC(12,2) NOT NULL DEFAULT 0,
      comprobante_url TEXT,
      comprobante_nombre TEXT,
      estado VARCHAR(20) NOT NULL DEFAULT 'en_revision',
      fecha_pago TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      aprobado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      aprobado_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (torre_id, anio, mes)
    );
  `);
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

async function findMesesByDepartamento({ torre_id, departamento_id, anio = getCurrentYear() }) {
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
    [torre_id, departamento_id, anio, MONTHLY_VALUE]
  );

  return result.rows;
}

async function createPago({ torre_id, departamento_id, anio = getCurrentYear(), mes, comprobante_url, comprobante_nombre }) {
  const existing = await pool.query(
    `SELECT p.id, p.estado
     FROM pagos_alicuotas p
     WHERE p.departamento_id = $1
       AND p.anio = $2
       AND p.mes = $3`,
    [departamento_id, anio, mes]
  );

  if (existing.rows[0]?.estado === 'aprobado') {
    const error = new Error('Esta alicuota ya fue aprobada');
    error.statusCode = 400;
    throw error;
  }

  const result = await pool.query(
    `INSERT INTO pagos_alicuotas (
       torre_id, departamento_id, anio, mes, descripcion, valor, comprobante_url, comprobante_nombre, estado
     )
     SELECT d.torre_id,
            d.id,
            $3::int,
            $4::int,
            'Alicuota mes ' || $4::int::text,
            $7,
            $5,
            $6,
            'en_revision'
     FROM departamentos d
     WHERE d.id = $2
       AND d.torre_id = $1
     ON CONFLICT (departamento_id, anio, mes)
     DO UPDATE SET comprobante_url = EXCLUDED.comprobante_url,
                   comprobante_nombre = EXCLUDED.comprobante_nombre,
                   estado = 'en_revision',
                   fecha_pago = NOW(),
                   aprobado_por = NULL,
                   aprobado_at = NULL,
                   updated_at = NOW()
     RETURNING *`,
    [torre_id, departamento_id, anio, mes, comprobante_url, comprobante_nombre, MONTHLY_VALUE]
  );

  return result.rows[0] || null;
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

async function approvePago(id, { user_id, torre_ids }) {
  const ids = normalizeIds(torre_ids);
  const values = [id, user_id || null];
  let torreFilter = '';

  if (ids.length > 0) {
    values.push(ids);
    torreFilter = `AND p.torre_id = ANY($${values.length}::int[])`;
  }

  const result = await pool.query(
    `UPDATE pagos_alicuotas p
     SET estado = 'aprobado',
         aprobado_por = $2,
         aprobado_at = NOW(),
         updated_at = NOW()
     WHERE p.id = $1
       ${torreFilter}
     RETURNING p.*`,
    values
  );

  return result.rows[0] || null;
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
    const error = new Error('Esta alicuota de torre ya fue aprobada');
    error.statusCode = 400;
    throw error;
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
  const result = await pool.query(
    `UPDATE pagos_alicuotas_torres
     SET estado = 'aprobado',
         aprobado_por = $2,
         aprobado_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, user_id || null]
  );

  return result.rows[0] || null;
}

module.exports = {
  ensureTable,
  findDepartamentosByTorre,
  findMesesByDepartamento,
  createPago,
  findPagos,
  approvePago,
  findMesesByTorre,
  createPagoTorre,
  findPagosTorres,
  approvePagoTorre,
  getCurrentYear,
};
