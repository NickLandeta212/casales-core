const { pool } = require('../config/database');
const alicuotaModel = require('./alicuota.model');
const multaModel = require('./multa.model');
const cargoModel = require('./cargo.model');

// Estado de cuenta de un departamento. Es la unica regla de deuda del portal y de los reportes:
//   - Alicuotas: meses del anio en curso hasta el mes actual sin pago o con el pago rechazado.
//   - Multas: las que siguen pendientes.
//   - Cargos extraordinarios: los que siguen pendientes.
// Lo que tiene un comprobante en revision no cuenta como deuda, pero impide emitir el paz y salvo.

function sumar(items, campo) {
  return items.reduce((total, item) => total + Number(item[campo] || 0), 0);
}

function calcularResumen({ mesesAnioActual, multas, cargos, hoy = new Date() }) {
  const mesActual = hoy.getMonth() + 1;
  const mesesAdeudados = mesesAnioActual.filter(
    (mes) => mes.mes <= mesActual && (mes.estado === 'pendiente' || mes.estado === 'rechazado')
  );
  const multasPendientes = multas.filter((multa) => multa.estado === 'pendiente');
  const cargosPendientes = cargos.filter((cargo) => cargo.estado === 'pendiente');

  const alicuotasAdeudadas = sumar(mesesAdeudados, 'valor');
  const multasAdeudadas = sumar(multasPendientes, 'monto');
  const cargosAdeudados = sumar(cargosPendientes, 'valor');
  const enRevision = mesesAnioActual.filter((mes) => mes.estado === 'en_revision').length
    + multas.filter((multa) => multa.estado === 'en_pago').length
    + cargos.filter((cargo) => cargo.estado === 'en_pago').length;

  return {
    anio: hoy.getFullYear(),
    meses_adeudados: mesesAdeudados.map((mes) => mes.mes),
    alicuotas_adeudadas: alicuotasAdeudadas,
    multas_adeudadas: multasAdeudadas,
    cargos_adeudados: cargosAdeudados,
    total_adeudado: alicuotasAdeudadas + multasAdeudadas + cargosAdeudados,
    pagos_en_revision: enRevision,
  };
}

async function findTitular(departamento_id) {
  const result = await pool.query(
    `SELECT COALESCE(
              (SELECT p.nombres || ' ' || p.apellidos
               FROM personas p
               WHERE p.departamento_id = d.id
               ORDER BY (p.tipo_ocupacion = 'dueno') DESC, p.id ASC
               LIMIT 1),
              u.nombre
            ) AS titular
     FROM departamentos d
     LEFT JOIN usuarios u ON u.id = d.usuario_id
     WHERE d.id = $1`,
    [departamento_id]
  );

  return result.rows[0]?.titular || null;
}

// departamento: { id, numero, torre_id, torre_numero }
async function build(departamento, anio) {
  const anioActual = new Date().getFullYear();

  const [alicuotas, multas, cargos, pagosMultas, pagosCargos, titular] = await Promise.all([
    alicuotaModel.findMesesByDepartamento({ torre_id: departamento.torre_id, departamento_id: departamento.id, anio }),
    multaModel.findAllByDepartamento(departamento.id),
    cargoModel.findCargosByDepartamento(departamento.id),
    multaModel.findPagosByDepartamento(departamento.id),
    cargoModel.findPagosByDepartamento(departamento.id),
    findTitular(departamento.id),
  ]);

  // El resumen siempre refleja lo vencido del anio en curso, sin importar el anio que se consulta.
  const mesesAnioActual = anio === anioActual
    ? alicuotas
    : await alicuotaModel.findMesesByDepartamento({ torre_id: departamento.torre_id, departamento_id: departamento.id, anio: anioActual });

  return {
    departamento: {
      id: departamento.id,
      numero: departamento.numero,
      torre_id: departamento.torre_id,
      torre_numero: departamento.torre_numero,
      titular,
    },
    anio,
    alicuotas,
    multas: multas.map(({ persona_cedula, ...multa }) => multa),
    cargos,
    pagos_multas: pagosMultas,
    pagos_cargos: pagosCargos,
    resumen: calcularResumen({ mesesAnioActual, multas, cargos }),
  };
}

async function createCertificado({ departamento_id, titular, user_id }) {
  const result = await pool.query(
    `INSERT INTO certificados (departamento_id, tipo, titular, emitido_por)
     VALUES ($1, 'paz_y_salvo', $2, $3)
     RETURNING id`,
    [departamento_id, titular, user_id || null]
  );

  return findCertificadoById(result.rows[0].id);
}

const CERTIFICADO_SELECT = `
  SELECT c.*, d.numero AS departamento_numero, d.torre_id, t.numero AS torre_numero, u.nombre AS emitido_por_nombre
  FROM certificados c
  INNER JOIN departamentos d ON d.id = c.departamento_id
  INNER JOIN torres t ON t.id = d.torre_id
  LEFT JOIN usuarios u ON u.id = c.emitido_por`;

async function findCertificadoById(id) {
  const result = await pool.query(`${CERTIFICADO_SELECT} WHERE c.id = $1`, [id]);
  return result.rows[0] || null;
}

async function findCertificados({ torre_ids, departamento_id = null }) {
  const values = [torre_ids];
  let filtro = '';

  if (departamento_id) {
    values.push(departamento_id);
    filtro = 'AND c.departamento_id = $2';
  }

  const result = await pool.query(
    `${CERTIFICADO_SELECT} WHERE d.torre_id = ANY($1::int[]) ${filtro} ORDER BY c.created_at DESC LIMIT 500`,
    values
  );

  return result.rows;
}

module.exports = { build, calcularResumen, createCertificado, findCertificadoById, findCertificados };
