const { pool, withTransaction } = require('../config/database');
const HttpError = require('../utils/httpError');

// Asambleas de copropietarios: convocada -> realizada | cancelada.
// Al convocar se publica un comunicado fijado para que todos la vean en la app.

const SELECT = `
  SELECT a.id, a.titulo, a.tipo, a.fecha_hora, a.lugar, a.orden_del_dia, a.estado, a.resultado,
         a.comunicado_id, a.correos_enviados, a.created_at, a.updated_at, u.nombre AS creado_por_nombre
  FROM asambleas a
  LEFT JOIN usuarios u ON u.id = a.creado_por`;

async function findAll() {
  const result = await pool.query(`${SELECT} ORDER BY a.fecha_hora DESC, a.id DESC`);
  return result.rows;
}

async function findById(id, client = pool) {
  const result = await client.query(`${SELECT} WHERE a.id = $1`, [id]);
  return result.rows[0] || null;
}

// comunicado: { titulo, contenido } que se publica junto con la convocatoria, o null para no publicarlo.
async function create({ titulo, tipo, fecha_hora, lugar, orden_del_dia, creado_por }, comunicado) {
  return withTransaction(async (client) => {
    let comunicadoId = null;

    if (comunicado) {
      const publicado = await client.query(
        `INSERT INTO comunicados (titulo, contenido, fijado, creado_por) VALUES ($1, $2, TRUE, $3) RETURNING id`,
        [comunicado.titulo, comunicado.contenido, creado_por]
      );
      comunicadoId = publicado.rows[0].id;
    }

    const result = await client.query(
      `INSERT INTO asambleas (titulo, tipo, fecha_hora, lugar, orden_del_dia, comunicado_id, creado_por)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
       RETURNING id`,
      [titulo, tipo, fecha_hora, lugar, JSON.stringify(orden_del_dia), comunicadoId, creado_por]
    );

    return findById(result.rows[0].id, client);
  });
}

// Cierra la asamblea como realizada o cancelada. El comunicado de la convocatoria deja de estar fijado
// y, si se cancela, su titulo lo indica para que nadie asista por error.
async function cerrar(id, { estado, resultado }) {
  return withTransaction(async (client) => {
    const actual = await client.query('SELECT estado, comunicado_id FROM asambleas WHERE id = $1 FOR UPDATE', [id]);

    if (!actual.rows[0]) {
      throw new HttpError(404, 'Asamblea no encontrada');
    }

    if (actual.rows[0].estado !== 'convocada') {
      throw new HttpError(409, `La asamblea ya esta ${actual.rows[0].estado}`);
    }

    await client.query(
      `UPDATE asambleas SET estado = $2, resultado = $3, updated_at = NOW() WHERE id = $1`,
      [id, estado, resultado]
    );

    if (actual.rows[0].comunicado_id) {
      await client.query(
        `UPDATE comunicados
         SET fijado = FALSE,
             titulo = CASE WHEN $2 = 'cancelada' THEN LEFT('CANCELADA: ' || titulo, 150) ELSE titulo END,
             updated_at = NOW()
         WHERE id = $1`,
        [actual.rows[0].comunicado_id, estado]
      );
    }

    return findById(id, client);
  });
}

async function registrarCorreosEnviados(id, cantidad) {
  await pool.query('UPDATE asambleas SET correos_enviados = correos_enviados + $2 WHERE id = $1', [id, cantidad]);
}

module.exports = { findAll, findById, create, cerrar, registrarCorreosEnviados };
