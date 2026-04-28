const { pool } = require('../config/database');

async function ensureMotivosTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS motivos_multa (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL UNIQUE
    )
  `);

  await pool.query(`
    INSERT INTO motivos_multa (nombre) VALUES
    ('Areas comunes'),
    ('Mascotas'),
    ('Parqueaderos')
    ON CONFLICT (nombre) DO NOTHING
  `);
}

async function ensureLegacySchemaCompatibility() {
  const columnsResult = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_name = 'multas'`
  );

  const columns = new Set(columnsResult.rows.map((row) => row.column_name));

  if (!columns.has('departamento_id')) {
    await pool.query('ALTER TABLE multas ADD COLUMN departamento_id INTEGER');
  }

  if (!columns.has('motivo_id')) {
    await pool.query('ALTER TABLE multas ADD COLUMN motivo_id INTEGER');
  }

  if (!columns.has('persona_nombre')) {
    await pool.query('ALTER TABLE multas ADD COLUMN persona_nombre TEXT');
  }

  if (!columns.has('persona_apellidos')) {
    await pool.query('ALTER TABLE multas ADD COLUMN persona_apellidos TEXT');
  }

  if (!columns.has('persona_cedula')) {
    await pool.query('ALTER TABLE multas ADD COLUMN persona_cedula TEXT');
  }

  if (!columns.has('descripcion')) {
    await pool.query('ALTER TABLE multas ADD COLUMN descripcion TEXT');
  }

  if (!columns.has('monto')) {
    await pool.query('ALTER TABLE multas ADD COLUMN monto NUMERIC(12, 2)');
  }

  if (!columns.has('aprobada')) {
    await pool.query('ALTER TABLE multas ADD COLUMN aprobada BOOLEAN DEFAULT FALSE');
  }

  if (!columns.has('fecha')) {
    await pool.query('ALTER TABLE multas ADD COLUMN fecha TIMESTAMPTZ DEFAULT NOW()');
  }

  if (columns.has('persona_id')) {
    await pool.query(
      `UPDATE multas m
       SET departamento_id = COALESCE(m.departamento_id, p.departamento_id),
           persona_nombre = COALESCE(NULLIF(m.persona_nombre, ''), p.nombres),
           persona_apellidos = COALESCE(NULLIF(m.persona_apellidos, ''), p.apellidos),
           persona_cedula = COALESCE(NULLIF(m.persona_cedula, ''), p.documento)
       FROM personas p
       WHERE m.persona_id = p.id`
    );
  }

  if (columns.has('motivo')) {
    await pool.query(
      `UPDATE multas m
       SET motivo_id = mm.id
       FROM motivos_multa mm
       WHERE m.motivo_id IS NULL
         AND LOWER(TRIM(COALESCE(m.motivo, ''))) = LOWER(mm.nombre)`
    );

    await pool.query(
      `UPDATE multas
       SET descripcion = COALESCE(NULLIF(TRIM(descripcion), ''), NULLIF(TRIM(motivo), ''), 'Sin descripcion')`
    );
  }

  await pool.query(
    `UPDATE multas
     SET motivo_id = (SELECT id FROM motivos_multa WHERE nombre = 'Areas comunes' LIMIT 1)
     WHERE motivo_id IS NULL`
  );

  await pool.query(
    `UPDATE multas
     SET persona_nombre = COALESCE(NULLIF(TRIM(persona_nombre), ''), 'Sin nombre'),
         persona_apellidos = COALESCE(NULLIF(TRIM(persona_apellidos), ''), 'Sin apellido'),
         persona_cedula = COALESCE(NULLIF(TRIM(persona_cedula), ''), 'Sin cedula'),
         descripcion = COALESCE(NULLIF(TRIM(descripcion), ''), 'Sin descripcion'),
         aprobada = COALESCE(aprobada, FALSE),
         fecha = COALESCE(fecha, NOW())`
  );
}

async function ensureTable() {
  await ensureMotivosTable();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS multas (
      id BIGSERIAL PRIMARY KEY,
      departamento_id INTEGER NOT NULL REFERENCES departamentos(id) ON DELETE CASCADE,
      motivo_id INTEGER NOT NULL REFERENCES motivos_multa(id),
      persona_nombre TEXT NOT NULL,
      persona_apellidos TEXT NOT NULL,
      persona_cedula TEXT NOT NULL,
      descripcion TEXT NOT NULL,
      monto NUMERIC(12, 2) NOT NULL,
      aprobada BOOLEAN NOT NULL DEFAULT FALSE,
      fecha TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await ensureLegacySchemaCompatibility();
}

async function findAll() {
  const result = await pool.query(
    `SELECT m.*,
            ROW_NUMBER() OVER (ORDER BY m.id ASC)::int AS numero_consecutivo,
         m.persona_nombre,
         m.persona_apellidos,
         m.persona_cedula,
         mo.nombre AS motivo_nombre,
            d.numero AS departamento_numero,
            t.numero AS torre_numero
       FROM multas m
     INNER JOIN departamentos d ON d.id = m.departamento_id
     INNER JOIN torres t ON t.id = d.torre_id
     INNER JOIN motivos_multa mo ON mo.id = m.motivo_id
     ORDER BY m.id ASC`
  );

  return result.rows;
}

async function findById(id) {
  const result = await pool.query(
    `SELECT m.*, m.id AS numero_consecutivo,
         m.persona_nombre,
         m.persona_apellidos,
         m.persona_cedula,
         mo.nombre AS motivo_nombre,
            d.numero AS departamento_numero,
            t.numero AS torre_numero
       FROM multas m
     INNER JOIN departamentos d ON d.id = m.departamento_id
     INNER JOIN torres t ON t.id = d.torre_id
     INNER JOIN motivos_multa mo ON mo.id = m.motivo_id
     WHERE m.id = $1`,
    [id]
  );

  return result.rows[0] || null;
}

async function findAllByUsuarioId(usuario_id) {
  const result = await pool.query(
    `SELECT m.*,
            ROW_NUMBER() OVER (ORDER BY m.id ASC)::int AS numero_consecutivo,
         m.persona_nombre,
         m.persona_apellidos,
         m.persona_cedula,
         mo.nombre AS motivo_nombre,
            d.numero AS departamento_numero,
            t.numero AS torre_numero
       FROM multas m
     INNER JOIN departamentos d ON d.id = m.departamento_id
     INNER JOIN torres t ON t.id = d.torre_id
     INNER JOIN motivos_multa mo ON mo.id = m.motivo_id
     WHERE d.usuario_id = $1
     ORDER BY m.id ASC`,
    [usuario_id]
  );

  return result.rows;
}

async function findMotivos() {
  const result = await pool.query(
    `SELECT id, nombre
     FROM motivos_multa
     ORDER BY nombre ASC`
  );

  return result.rows;
}

async function findByIdForUsuario(id, usuario_id) {
  const result = await pool.query(
    `SELECT m.*, m.id AS numero_consecutivo,
         m.persona_nombre,
         m.persona_apellidos,
         m.persona_cedula,
         mo.nombre AS motivo_nombre,
            d.numero AS departamento_numero,
            t.numero AS torre_numero
       FROM multas m
     INNER JOIN departamentos d ON d.id = m.departamento_id
     INNER JOIN torres t ON t.id = d.torre_id
     INNER JOIN motivos_multa mo ON mo.id = m.motivo_id
     WHERE m.id = $1 AND d.usuario_id = $2`,
    [id, usuario_id]
  );

  return result.rows[0] || null;
}

async function isDepartamentoOwnedByUsuario(departamento_id, usuario_id) {
  const result = await pool.query(
    'SELECT id FROM departamentos WHERE id = $1 AND usuario_id = $2 LIMIT 1',
    [departamento_id, usuario_id]
  );

  return result.rowCount > 0;
}

async function create({ departamento_id, motivo_id, persona_nombre, persona_apellidos, persona_cedula, descripcion, monto, aprobada, fecha }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const departamentoResult = await client.query(
      'SELECT id FROM departamentos WHERE id = $1 FOR UPDATE',
      [departamento_id]
    );

    if (departamentoResult.rowCount === 0) {
      const error = new Error('Departamento no encontrado');
      error.statusCode = 404;
      throw error;
    }

    const motivoResult = await client.query(
      'SELECT id FROM motivos_multa WHERE id = $1',
      [motivo_id]
    );

    if (motivoResult.rowCount === 0) {
      const error = new Error('Motivo no encontrado');
      error.statusCode = 404;
      throw error;
    }

    const inserted = await client.query(
      `INSERT INTO multas (departamento_id, motivo_id, persona_nombre, persona_apellidos, persona_cedula, descripcion, monto, aprobada, fecha)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        departamento_id,
        motivo_id,
        persona_nombre,
        persona_apellidos,
        persona_cedula,
        descripcion,
        monto,
        typeof aprobada === 'boolean' ? aprobada : false,
        fecha || new Date(),
      ]
    );

    await client.query('COMMIT');
    return findById(inserted.rows[0].id);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function update(id, { departamento_id, motivo_id, persona_nombre, persona_apellidos, persona_cedula, descripcion, monto, aprobada, fecha }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const existing = await client.query('SELECT id FROM multas WHERE id = $1 FOR UPDATE', [id]);

    if (existing.rowCount === 0) {
      await client.query('COMMIT');
      return null;
    }

    const departamentoResult = await client.query(
      'SELECT id FROM departamentos WHERE id = $1 FOR UPDATE',
      [departamento_id]
    );

    if (departamentoResult.rowCount === 0) {
      const error = new Error('Departamento no encontrado');
      error.statusCode = 404;
      throw error;
    }

    const motivoResult = await client.query(
      'SELECT id FROM motivos_multa WHERE id = $1',
      [motivo_id]
    );

    if (motivoResult.rowCount === 0) {
      const error = new Error('Motivo no encontrado');
      error.statusCode = 404;
      throw error;
    }

    const updated = await client.query(
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
       WHERE id = $10
       RETURNING *`,
      [
        departamento_id,
        motivo_id,
        persona_nombre,
        persona_apellidos,
        persona_cedula,
        descripcion,
        monto,
        typeof aprobada === 'boolean' ? aprobada : false,
        fecha || new Date(),
        id,
      ]
    );

    await client.query('COMMIT');
    return updated.rowCount > 0 ? findById(id) : null;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function remove(id) {
  const result = await pool.query('DELETE FROM multas WHERE id = $1 RETURNING *', [id]);

  return result.rows[0] || null;
}

module.exports = {
  ensureTable,
  findAll,
  findById,
  findAllByUsuarioId,
  findByIdForUsuario,
  findMotivos,
  isDepartamentoOwnedByUsuario,
  create,
  update,
  remove,
};