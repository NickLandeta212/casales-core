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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pagos_multas (
      id BIGSERIAL PRIMARY KEY,
      departamento_id INTEGER NOT NULL REFERENCES departamentos(id) ON DELETE CASCADE,
      total NUMERIC(12, 2) NOT NULL,
      comprobante_url TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'en_proceso',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pagos_multas_detalle (
      id BIGSERIAL PRIMARY KEY,
      pago_multa_id BIGINT NOT NULL REFERENCES pagos_multas(id) ON DELETE CASCADE,
      multa_id BIGINT REFERENCES multas(id) ON DELETE SET NULL,
      monto NUMERIC(12, 2) NOT NULL,
      descripcion TEXT,
      persona_nombre TEXT,
      persona_apellidos TEXT,
      motivo_nombre TEXT,
      UNIQUE (pago_multa_id, multa_id)
    )
  `);

  await ensurePagosDetalleCompatibility();
}

async function ensurePagosDetalleCompatibility() {
  const columnsResult = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_name = 'pagos_multas_detalle'`
  );

  const columns = new Set(columnsResult.rows.map((row) => row.column_name));

  if (!columns.has('descripcion')) {
    await pool.query('ALTER TABLE pagos_multas_detalle ADD COLUMN descripcion TEXT');
  }

  if (!columns.has('persona_nombre')) {
    await pool.query('ALTER TABLE pagos_multas_detalle ADD COLUMN persona_nombre TEXT');
  }

  if (!columns.has('persona_apellidos')) {
    await pool.query('ALTER TABLE pagos_multas_detalle ADD COLUMN persona_apellidos TEXT');
  }

  if (!columns.has('motivo_nombre')) {
    await pool.query('ALTER TABLE pagos_multas_detalle ADD COLUMN motivo_nombre TEXT');
  }

  await pool.query('ALTER TABLE pagos_multas_detalle ALTER COLUMN multa_id DROP NOT NULL');

  const fkResult = await pool.query(
    `SELECT conname
     FROM pg_constraint
     WHERE conrelid = 'pagos_multas_detalle'::regclass
       AND confrelid = 'multas'::regclass
       AND contype = 'f'`
  );

  for (const row of fkResult.rows) {
    await pool.query(`ALTER TABLE pagos_multas_detalle DROP CONSTRAINT ${row.conname}`);
  }

  await pool.query(`
    ALTER TABLE pagos_multas_detalle
    ADD CONSTRAINT pagos_multas_detalle_multa_id_fkey
    FOREIGN KEY (multa_id) REFERENCES multas(id) ON DELETE SET NULL
  `);

  await pool.query(`
    UPDATE pagos_multas_detalle pmd
    SET descripcion = COALESCE(pmd.descripcion, m.descripcion),
        persona_nombre = COALESCE(pmd.persona_nombre, m.persona_nombre),
        persona_apellidos = COALESCE(pmd.persona_apellidos, m.persona_apellidos),
        motivo_nombre = COALESCE(pmd.motivo_nombre, mm.nombre)
    FROM multas m
    INNER JOIN motivos_multa mm ON mm.id = m.motivo_id
    WHERE pmd.multa_id = m.id
  `);
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

async function createPago({ departamento_id, multa_ids, total, comprobante_url }) {
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

    const multasResult = await client.query(
      `SELECT m.id,
              m.monto,
              m.descripcion,
              m.persona_nombre,
              m.persona_apellidos,
              mm.nombre AS motivo_nombre
       FROM multas m
       INNER JOIN motivos_multa mm ON mm.id = m.motivo_id
       WHERE m.departamento_id = $1
         AND m.id = ANY($2::bigint[])
       ORDER BY m.id ASC
       FOR UPDATE`,
      [departamento_id, multa_ids]
    );

    if (multasResult.rowCount === 0) {
      const error = new Error('No hay multas registradas para este departamento');
      error.statusCode = 400;
      throw error;
    }

    if (multasResult.rowCount !== multa_ids.length) {
      const error = new Error('Una o mas multas no pertenecen al departamento seleccionado');
      error.statusCode = 400;
      throw error;
    }

    const realTotal = multasResult.rows.reduce((sum, multa) => sum + Number(multa.monto || 0), 0);

    if (Number(total).toFixed(2) !== realTotal.toFixed(2)) {
      const error = new Error('El total enviado no coincide con las multas seleccionadas');
      error.statusCode = 400;
      throw error;
    }

    const pagoResult = await client.query(
      `INSERT INTO pagos_multas (departamento_id, total, comprobante_url, estado)
       VALUES ($1, $2, $3, 'en_proceso')
       RETURNING *`,
      [departamento_id, realTotal, comprobante_url]
    );

    const pago = pagoResult.rows[0];

    for (const multa of multasResult.rows) {
      await client.query(
        `INSERT INTO pagos_multas_detalle
           (pago_multa_id, multa_id, monto, descripcion, persona_nombre, persona_apellidos, motivo_nombre)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          pago.id,
          multa.id,
          multa.monto,
          multa.descripcion,
          multa.persona_nombre,
          multa.persona_apellidos,
          multa.motivo_nombre,
        ]
      );
    }

    await client.query('COMMIT');
    return findPagoById(pago.id);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function findPagoById(id) {
  const pagoResult = await pool.query(
    `SELECT p.*, d.numero AS departamento_numero, t.numero AS torre_numero
     FROM pagos_multas p
     INNER JOIN departamentos d ON d.id = p.departamento_id
     INNER JOIN torres t ON t.id = d.torre_id
     WHERE p.id = $1`,
    [id]
  );

  const pago = pagoResult.rows[0] || null;

  if (!pago) {
    return null;
  }

  const detalleResult = await pool.query(
    `SELECT pmd.multa_id,
            pmd.monto,
            COALESCE(pmd.descripcion, m.descripcion) AS descripcion,
            COALESCE(pmd.persona_nombre, m.persona_nombre) AS persona_nombre,
            COALESCE(pmd.persona_apellidos, m.persona_apellidos) AS persona_apellidos,
            COALESCE(pmd.motivo_nombre, mm.nombre) AS motivo_nombre
     FROM pagos_multas_detalle pmd
     LEFT JOIN multas m ON m.id = pmd.multa_id
     LEFT JOIN motivos_multa mm ON mm.id = m.motivo_id
     WHERE pmd.pago_multa_id = $1
     ORDER BY pmd.id ASC`,
    [id]
  );

  return {
    ...pago,
    multas: detalleResult.rows,
  };
}

async function findPagos() {
  const result = await pool.query(
    `SELECT p.*, d.numero AS departamento_numero, t.numero AS torre_numero
     FROM pagos_multas p
     INNER JOIN departamentos d ON d.id = p.departamento_id
     INNER JOIN torres t ON t.id = d.torre_id
     ORDER BY p.created_at DESC`
  );

  return Promise.all(result.rows.map((pago) => findPagoById(pago.id)));
}

async function approvePago(id) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const pagoResult = await client.query(
      `SELECT *
       FROM pagos_multas
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );

    const pago = pagoResult.rows[0];

    if (!pago) {
      await client.query('COMMIT');
      return null;
    }

    if (pago.estado === 'aprobado') {
      await client.query('COMMIT');
      return findPagoById(id);
    }

    await client.query(
      `UPDATE pagos_multas_detalle pmd
       SET descripcion = COALESCE(pmd.descripcion, m.descripcion),
           persona_nombre = COALESCE(pmd.persona_nombre, m.persona_nombre),
           persona_apellidos = COALESCE(pmd.persona_apellidos, m.persona_apellidos),
           motivo_nombre = COALESCE(pmd.motivo_nombre, mm.nombre)
       FROM multas m
       INNER JOIN motivos_multa mm ON mm.id = m.motivo_id
       WHERE pmd.pago_multa_id = $1
         AND pmd.multa_id = m.id`,
      [id]
    );

    const multasResult = await client.query(
      `SELECT multa_id
       FROM pagos_multas_detalle
       WHERE pago_multa_id = $1
         AND multa_id IS NOT NULL`,
      [id]
    );

    const multaIds = multasResult.rows.map((row) => Number(row.multa_id)).filter((multaId) => multaId > 0);

    if (multaIds.length > 0) {
      await client.query('DELETE FROM multas WHERE id = ANY($1::bigint[])', [multaIds]);
    }

    await client.query(
      `UPDATE pagos_multas
       SET estado = 'aprobado',
           updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

    await client.query('COMMIT');
    return findPagoById(id);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
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
  createPago,
  findPagoById,
  findPagos,
  approvePago,
};
