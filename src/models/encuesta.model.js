const { pool, withTransaction } = require('../config/database');

// Cada encuesta trae sus opciones con el conteo de votos. Nunca se expone quien voto por que opcion:
// solo totales y, para el condomino, la opcion que eligio su propio departamento ($1 = su usuario).
const SELECT = `
  SELECT e.id, e.titulo, e.descripcion, e.estado, e.created_at, e.cerrada_at, u.nombre AS creado_por_nombre,
         (SELECT COUNT(*)::int FROM encuesta_votos v WHERE v.encuesta_id = e.id) AS total_votos,
         (SELECT COUNT(*)::int FROM departamentos) AS total_departamentos,
         (SELECT v.opcion_id
          FROM encuesta_votos v
          INNER JOIN departamentos d ON d.id = v.departamento_id
          WHERE v.encuesta_id = e.id AND d.usuario_id = $1) AS mi_voto,
         (SELECT COALESCE(json_agg(json_build_object(
                   'id', o.id,
                   'texto', o.texto,
                   'votos', (SELECT COUNT(*)::int FROM encuesta_votos v WHERE v.opcion_id = o.id)
                 ) ORDER BY o.orden), '[]'::json)
          FROM encuesta_opciones o
          WHERE o.encuesta_id = e.id) AS opciones
  FROM encuestas e
  LEFT JOIN usuarios u ON u.id = e.creado_por`;

// Abiertas primero; dentro de cada grupo, de la mas reciente a la mas antigua.
async function findAll(usuario_id) {
  const result = await pool.query(`${SELECT} ORDER BY (e.estado = 'abierta') DESC, e.created_at DESC, e.id DESC LIMIT 200`, [usuario_id]);
  return result.rows;
}

async function findById(id, usuario_id) {
  const result = await pool.query(`${SELECT} WHERE e.id = $2`, [usuario_id, id]);
  return result.rows[0] || null;
}

async function create({ titulo, descripcion, opciones, creado_por }) {
  const id = await withTransaction(async (client) => {
    const encuesta = await client.query(
      `INSERT INTO encuestas (titulo, descripcion, creado_por) VALUES ($1, $2, $3) RETURNING id`,
      [titulo, descripcion || null, creado_por]
    );

    // Todas las opciones en una sola consulta, numeradas en el orden recibido.
    await client.query(
      `INSERT INTO encuesta_opciones (encuesta_id, texto, orden)
       SELECT $1, opcion.texto, opcion.orden
       FROM unnest($2::text[]) WITH ORDINALITY AS opcion(texto, orden)`,
      [encuesta.rows[0].id, opciones]
    );

    return encuesta.rows[0].id;
  });

  return findById(id, creado_por);
}

async function cerrar(id) {
  const result = await pool.query(
    `UPDATE encuestas SET estado = 'cerrada', cerrada_at = NOW() WHERE id = $1 AND estado = 'abierta' RETURNING id, titulo`,
    [id]
  );

  return result.rows[0] || null;
}

async function remove(id) {
  const result = await pool.query('DELETE FROM encuestas WHERE id = $1 RETURNING id, titulo', [id]);
  return result.rows[0] || null;
}

// Devuelve 'ok', 'cerrada' (no existe o ya cerro), 'opcion' (no es de esta encuesta) o 'repetido'.
async function votar({ encuesta_id, opcion_id, departamento_id, usuario_id }) {
  try {
    const result = await pool.query(
      `INSERT INTO encuesta_votos (encuesta_id, opcion_id, departamento_id, usuario_id)
       SELECT e.id, $2, $3, $4
       FROM encuestas e
       WHERE e.id = $1 AND e.estado = 'abierta'
       RETURNING id`,
      [encuesta_id, opcion_id, departamento_id, usuario_id]
    );

    return result.rows[0] ? 'ok' : 'cerrada';
  } catch (error) {
    if (error.code === '23505') {
      return 'repetido';
    }

    if (error.code === '23503') {
      return 'opcion';
    }

    throw error;
  }
}

module.exports = { findAll, findById, create, cerrar, remove, votar };
