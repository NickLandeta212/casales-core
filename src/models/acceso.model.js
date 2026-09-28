const { pool } = require('../config/database');

// Visitas activas (en porteria o dentro) y las de los ultimos 30 dias.
async function findRecientes() {
  const result = await pool.query(
    `SELECT a.*, u.nombre AS registrado_por_nombre
     FROM accesos_guardia a
     LEFT JOIN usuarios u ON u.id = a.registrado_por
     WHERE a.estado IN ('en_porteria', 'ingreso')
        OR a.created_at >= NOW() - INTERVAL '30 days'
     ORDER BY a.created_at DESC
     LIMIT 500`
  );

  return result.rows;
}

async function create(data) {
  const autorizado = data.autorizacion === 'autorizado';
  const rechazado = data.autorizacion === 'rechazado';

  const result = await pool.query(
    `INSERT INTO accesos_guardia (
       torre, departamento, duenio_contactado, visitante, documento, placa_vehiculo,
       hora_ingreso_vehiculo, autorizacion, estado, observacion, ingreso_at, registrado_por
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      data.torre,
      data.departamento,
      data.duenio_contactado,
      data.visitante,
      data.documento || null,
      data.placa_vehiculo || null,
      data.hora_ingreso_vehiculo || null,
      data.autorizacion,
      autorizado ? 'ingreso' : rechazado ? 'rechazado' : 'en_porteria',
      data.observacion || null,
      autorizado ? new Date() : null,
      data.registrado_por,
    ]
  );

  return result.rows[0];
}

// Transiciones validas: en_porteria -> ingreso | rechazado; ingreso -> salio.
const TRANSICIONES = {
  autorizar: {
    desde: 'en_porteria',
    set: "autorizacion = 'autorizado', estado = 'ingreso', ingreso_at = NOW()",
  },
  rechazar: {
    desde: 'en_porteria',
    set: "autorizacion = 'rechazado', estado = 'rechazado'",
  },
  salida: {
    desde: 'ingreso',
    set: "estado = 'salio', salida_at = NOW()",
  },
};

async function cambiarEstado(id, accion) {
  const transicion = TRANSICIONES[accion];

  const result = await pool.query(
    `UPDATE accesos_guardia
     SET ${transicion.set}, updated_at = NOW()
     WHERE id = $1 AND estado = $2
     RETURNING *`,
    [id, transicion.desde]
  );

  return result.rows[0] || null;
}

module.exports = { findRecientes, create, cambiarEstado, ACCIONES: Object.keys(TRANSICIONES) };
