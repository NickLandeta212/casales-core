const { pool, withTransaction } = require('../config/database');

// "Hoy" del conjunto, sin depender de la zona horaria del servidor ni de la base.
const HOY = "(NOW() AT TIME ZONE 'America/Guayaquil')::date";

const VISITA_SELECT = `
  SELECT v.id, v.departamento_id, v.visitante, v.documento, v.placa_vehiculo, TO_CHAR(v.fecha, 'YYYY-MM-DD') AS fecha,
         v.nota, v.estado, v.created_at, v.updated_at, (v.fecha = ${HOY}) AS es_hoy,
         d.numero AS departamento_numero, t.numero AS torre_numero
  FROM visitas_anunciadas v
  INNER JOIN departamentos d ON d.id = v.departamento_id
  INNER JOIN torres t ON t.id = d.torre_id`;

const PAQUETE_SELECT = `
  SELECT p.id, p.departamento_id, p.descripcion, p.estado, p.entregado_a, p.entregado_at, p.created_at,
         d.numero AS departamento_numero, t.numero AS torre_numero,
         r.nombre AS recibido_por_nombre
  FROM paquetes p
  INNER JOIN departamentos d ON d.id = p.departamento_id
  INNER JOIN torres t ON t.id = d.torre_id
  LEFT JOIN usuarios r ON r.id = p.recibido_por`;

// Solo codigos de torre y departamento: la guardia elige a quien va un paquete sin ver datos personales.
async function findDepartamentos() {
  const result = await pool.query(
    `SELECT d.id, d.numero, t.numero AS torre_numero
     FROM departamentos d
     INNER JOIN torres t ON t.id = d.torre_id
     ORDER BY t.numero ASC, d.numero ASC`
  );

  return result.rows;
}

async function getHoy() {
  const result = await pool.query(`SELECT TO_CHAR(${HOY}, 'YYYY-MM-DD') AS hoy`);
  return result.rows[0].hoy;
}

// Visitas del departamento del condomino: las proximas y las de los ultimos 30 dias.
async function findVisitasByUsuario(usuario_id) {
  const result = await pool.query(
    `${VISITA_SELECT}
     WHERE d.usuario_id = $1 AND v.fecha >= ${HOY} - 30
     ORDER BY v.fecha DESC, v.id DESC
     LIMIT 200`,
    [usuario_id]
  );

  return result.rows;
}

// Lo que ve la guardia: todo lo de hoy y lo anunciado para los proximos dias.
async function findVisitasPorteria() {
  const result = await pool.query(
    `${VISITA_SELECT}
     WHERE v.fecha = ${HOY} OR (v.fecha > ${HOY} AND v.estado = 'anunciada')
     ORDER BY v.fecha ASC, t.numero ASC, d.numero ASC, v.id ASC
     LIMIT 500`
  );

  return result.rows;
}

async function findVisitaById(id) {
  const result = await pool.query(`${VISITA_SELECT} WHERE v.id = $1`, [id]);
  return result.rows[0] || null;
}

async function createVisita({ departamento_id, visitante, documento, placa_vehiculo, fecha, nota, creado_por }) {
  const result = await pool.query(
    `INSERT INTO visitas_anunciadas (departamento_id, visitante, documento, placa_vehiculo, fecha, nota, creado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [departamento_id, visitante, documento || null, placa_vehiculo || null, fecha, nota || null, creado_por]
  );

  return findVisitaById(result.rows[0].id);
}

// Solo el condomino dueno del departamento y solo si aun no ingresa.
async function cancelarVisita(id, usuario_id) {
  const result = await pool.query(
    `UPDATE visitas_anunciadas v
     SET estado = 'cancelada', updated_at = NOW()
     FROM departamentos d
     WHERE v.id = $1 AND d.id = v.departamento_id AND d.usuario_id = $2 AND v.estado = 'anunciada'
     RETURNING v.id`,
    [id, usuario_id]
  );

  return result.rows[0] ? findVisitaById(id) : null;
}

// Confirma el ingreso de una visita anunciada para hoy y la deja en el registro de accesos,
// todo en una transaccion. Devuelve null si no existe, no es de hoy o ya no esta anunciada.
async function registrarIngresoVisita(id, registrado_por) {
  const registrada = await withTransaction(async (client) => {
    const visita = (await client.query(
      `SELECT v.*, d.numero AS departamento_numero, t.numero AS torre_numero
       FROM visitas_anunciadas v
       INNER JOIN departamentos d ON d.id = v.departamento_id
       INNER JOIN torres t ON t.id = d.torre_id
       WHERE v.id = $1 AND v.estado = 'anunciada' AND v.fecha = ${HOY}
       FOR UPDATE OF v`,
      [id]
    )).rows[0];

    if (!visita) {
      return false;
    }

    const acceso = await client.query(
      `INSERT INTO accesos_guardia (
         torre, departamento, duenio_contactado, visitante, documento, placa_vehiculo,
         autorizacion, estado, observacion, ingreso_at, registrado_por
       )
       VALUES ($1, $2, 'Visita anunciada por el residente', $3, $4, $5, 'autorizado', 'ingreso', $6, NOW(), $7)
       RETURNING id`,
      [`Torre ${visita.torre_numero}`, visita.departamento_numero, visita.visitante, visita.documento, visita.placa_vehiculo, visita.nota, registrado_por]
    );

    await client.query(
      `UPDATE visitas_anunciadas SET estado = 'ingreso', acceso_id = $1, updated_at = NOW() WHERE id = $2`,
      [acceso.rows[0].id, id]
    );

    return true;
  });

  return registrada ? findVisitaById(id) : null;
}

// Paquetes del departamento del condomino: los que esperan en porteria y los entregados en los ultimos 30 dias.
async function findPaquetesByUsuario(usuario_id) {
  const result = await pool.query(
    `${PAQUETE_SELECT}
     WHERE d.usuario_id = $1 AND (p.estado = 'en_porteria' OR p.entregado_at >= NOW() - INTERVAL '30 days')
     ORDER BY (p.estado = 'en_porteria') DESC, p.created_at DESC
     LIMIT 200`,
    [usuario_id]
  );

  return result.rows;
}

// Lo que ve la guardia: todo lo que sigue en porteria y lo entregado en los ultimos 7 dias.
async function findPaquetesPorteria() {
  const result = await pool.query(
    `${PAQUETE_SELECT}
     WHERE p.estado = 'en_porteria' OR p.entregado_at >= NOW() - INTERVAL '7 days'
     ORDER BY (p.estado = 'en_porteria') DESC, p.created_at DESC
     LIMIT 500`
  );

  return result.rows;
}

async function findPaqueteById(id) {
  const result = await pool.query(`${PAQUETE_SELECT} WHERE p.id = $1`, [id]);
  return result.rows[0] || null;
}

async function createPaquete({ departamento_id, descripcion, recibido_por }) {
  const result = await pool.query(
    `INSERT INTO paquetes (departamento_id, descripcion, recibido_por)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [departamento_id, descripcion, recibido_por]
  );

  return findPaqueteById(result.rows[0].id);
}

async function entregarPaquete(id, { entregado_a, entregado_por }) {
  const result = await pool.query(
    `UPDATE paquetes
     SET estado = 'entregado', entregado_a = $1, entregado_por = $2, entregado_at = NOW()
     WHERE id = $3 AND estado = 'en_porteria'
     RETURNING id`,
    [entregado_a, entregado_por, id]
  );

  return result.rows[0] ? findPaqueteById(id) : null;
}

module.exports = {
  findDepartamentos,
  getHoy,
  findVisitasByUsuario,
  findVisitasPorteria,
  createVisita,
  cancelarVisita,
  registrarIngresoVisita,
  findPaquetesByUsuario,
  findPaquetesPorteria,
  createPaquete,
  entregarPaquete,
};
