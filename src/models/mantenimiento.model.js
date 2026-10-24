const { pool, withTransaction } = require('../config/database');
const HttpError = require('../utils/httpError');

// Mantenimientos programados (ascensores, bombas, jardines, extintores...).
// Al marcar uno como realizado se guarda la ejecucion y la proxima fecha avanza segun la frecuencia;
// los de frecuencia 'unica' quedan inactivos.
const INTERVALOS = {
  mensual: '1 month',
  trimestral: '3 months',
  semestral: '6 months',
  anual: '1 year',
};

// "Hoy" en la zona del conjunto (el servidor de base de datos trabaja en UTC).
const HOY = "(NOW() AT TIME ZONE 'America/Guayaquil')::date";

const SELECT = `
  SELECT m.id, m.titulo, m.descripcion, m.area, m.proveedor_id, p.nombre AS proveedor_nombre,
         m.costo_estimado, m.frecuencia, TO_CHAR(m.proxima_fecha, 'YYYY-MM-DD') AS proxima_fecha,
         m.dias_aviso, m.activo, m.created_at,
         (m.proxima_fecha - ${HOY})::int AS dias_restantes,
         ultima.fecha AS ultima_ejecucion
  FROM mantenimientos m
  LEFT JOIN proveedores p ON p.id = m.proveedor_id
  LEFT JOIN LATERAL (
    SELECT TO_CHAR(MAX(e.fecha), 'YYYY-MM-DD') AS fecha FROM mantenimiento_ejecuciones e WHERE e.mantenimiento_id = m.id
  ) ultima ON TRUE`;

async function findAll() {
  const result = await pool.query(`${SELECT} ORDER BY m.activo DESC, m.proxima_fecha ASC, m.id ASC`);
  return result.rows;
}

// Activos cuya fecha cae dentro de los proximos `dias` (incluye los atrasados).
async function findProximos(dias) {
  const result = await pool.query(
    `${SELECT} WHERE m.activo = TRUE AND m.proxima_fecha <= ${HOY} + $1::int ORDER BY m.proxima_fecha ASC`,
    [dias]
  );
  return result.rows;
}

async function findById(id, client = pool) {
  const result = await client.query(`${SELECT} WHERE m.id = $1`, [id]);
  return result.rows[0] || null;
}

async function findEjecuciones(id) {
  const result = await pool.query(
    `SELECT e.id, TO_CHAR(e.fecha, 'YYYY-MM-DD') AS fecha, e.observaciones, e.costo, e.created_at, u.nombre AS registrado_por_nombre
     FROM mantenimiento_ejecuciones e
     LEFT JOIN usuarios u ON u.id = e.registrado_por
     WHERE e.mantenimiento_id = $1
     ORDER BY e.fecha DESC, e.id DESC`,
    [id]
  );
  return result.rows;
}

async function create(datos) {
  const result = await pool.query(
    `INSERT INTO mantenimientos (titulo, descripcion, area, proveedor_id, costo_estimado, frecuencia, proxima_fecha, dias_aviso, creado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [datos.titulo, datos.descripcion, datos.area, datos.proveedor_id, datos.costo_estimado, datos.frecuencia,
      datos.proxima_fecha, datos.dias_aviso, datos.creado_por]
  );
  return findById(result.rows[0].id);
}

// Si cambia la proxima fecha, el recordatorio vuelve a enviarse para la nueva fecha.
async function update(id, datos) {
  const result = await pool.query(
    `UPDATE mantenimientos
     SET titulo = $2, descripcion = $3, area = $4, proveedor_id = $5, costo_estimado = $6, frecuencia = $7,
         proxima_fecha = $8, dias_aviso = $9, activo = $10, updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [id, datos.titulo, datos.descripcion, datos.area, datos.proveedor_id, datos.costo_estimado, datos.frecuencia,
      datos.proxima_fecha, datos.dias_aviso, datos.activo]
  );
  return result.rows[0] ? findById(id) : null;
}

async function registrarEjecucion(id, { fecha, observaciones, costo, user_id }) {
  return withTransaction(async (client) => {
    const actual = await client.query('SELECT frecuencia, activo FROM mantenimientos WHERE id = $1 FOR UPDATE', [id]);

    if (!actual.rows[0]) {
      throw new HttpError(404, 'Mantenimiento no encontrado');
    }

    if (!actual.rows[0].activo) {
      throw new HttpError(409, 'El mantenimiento esta inactivo');
    }

    await client.query(
      `INSERT INTO mantenimiento_ejecuciones (mantenimiento_id, fecha, observaciones, costo, registrado_por)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, fecha, observaciones, costo, user_id]
    );

    const intervalo = INTERVALOS[actual.rows[0].frecuencia];

    if (intervalo) {
      await client.query(
        `UPDATE mantenimientos SET proxima_fecha = ($2::date + $3::interval)::date, updated_at = NOW() WHERE id = $1`,
        [id, fecha, intervalo]
      );
    } else {
      await client.query('UPDATE mantenimientos SET activo = FALSE, updated_at = NOW() WHERE id = $1', [id]);
    }

    return findById(id, client);
  });
}

// Activos que ya entraron en su ventana de aviso y aun no tienen recordatorio para su fecha actual.
async function findPendientesDeAviso() {
  const result = await pool.query(
    `${SELECT}
     WHERE m.activo = TRUE
       AND m.proxima_fecha - m.dias_aviso <= ${HOY}
       AND m.aviso_enviado_para IS DISTINCT FROM m.proxima_fecha
     ORDER BY m.proxima_fecha ASC`
  );
  return result.rows;
}

async function marcarAvisoEnviado(ids) {
  await pool.query('UPDATE mantenimientos SET aviso_enviado_para = proxima_fecha WHERE id = ANY($1::int[])', [ids]);
}

module.exports = {
  findAll, findProximos, findById, findEjecuciones, create, update, registrarEjecucion, findPendientesDeAviso, marcarAvisoEnviado,
};
