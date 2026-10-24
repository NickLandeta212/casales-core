const { CONJUNTO, MESES, formatCurrency, formatDate, renderPdf, header, seccion, fila } = require('./pdf-base');

const ESTADOS = {
  pendiente: 'Pendiente',
  en_revision: 'En revision',
  en_pago: 'En revision',
  aprobado: 'Pagado',
  pagado: 'Pagado',
  pagada: 'Pagada',
  rechazado: 'Rechazado',
  anulado: 'Anulado',
};

function buildEstadoCuentaPdf(estado) {
  const { departamento, anio, resumen } = estado;

  return renderPdf((doc) => {
    header(doc, 'Estado de cuenta', `Torre ${departamento.torre_numero} - Departamento ${departamento.numero}`);

    doc.fontSize(10).fillColor('#111827');
    doc.text(`Titular: ${departamento.titular || 'Sin registrar'}`);
    doc.text(`Fecha de emision: ${formatDate()}`);
    doc.text(`Periodo de alicuotas: ${anio}`);

    seccion(doc, `Resumen de deuda a la fecha (${resumen.anio})`);
    fila(doc, [{ text: 'Alicuotas vencidas', width: 300 }, { text: formatCurrency(resumen.alicuotas_adeudadas), width: 195, align: 'right' }]);
    fila(doc, [{ text: 'Multas pendientes', width: 300 }, { text: formatCurrency(resumen.multas_adeudadas), width: 195, align: 'right' }]);
    fila(doc, [{ text: 'Cargos extraordinarios pendientes', width: 300 }, { text: formatCurrency(resumen.cargos_adeudados), width: 195, align: 'right' }]);
    fila(doc, [{ text: 'Total adeudado', width: 300 }, { text: formatCurrency(resumen.total_adeudado), width: 195, align: 'right' }], { bold: true });

    if (resumen.pagos_en_revision > 0) {
      doc.fontSize(9).fillColor('#92400e').text(`${resumen.pagos_en_revision} pago(s) en revision no se cuentan como deuda.`, 50);
    }

    seccion(doc, `Alicuotas ${anio}`);
    fila(doc, [{ text: 'Mes', width: 200 }, { text: 'Valor', width: 145, align: 'right' }, { text: 'Estado', width: 150, align: 'right' }], { bold: true, color: '#475569' });
    estado.alicuotas.forEach((mes) => {
      fila(doc, [
        { text: MESES[mes.mes - 1], width: 200 },
        { text: formatCurrency(mes.valor), width: 145, align: 'right' },
        { text: ESTADOS[mes.estado] || mes.estado, width: 150, align: 'right' },
      ]);
    });

    const cargos = estado.cargos.filter((cargo) => cargo.estado !== 'anulado');

    if (cargos.length > 0) {
      seccion(doc, 'Cargos extraordinarios');
      fila(doc, [{ text: 'Concepto', width: 200 }, { text: 'Periodo', width: 80 }, { text: 'Valor', width: 100, align: 'right' }, { text: 'Estado', width: 115, align: 'right' }], { bold: true, color: '#475569' });
      cargos.forEach((cargo) => {
        fila(doc, [
          { text: cargo.concepto, width: 200 },
          { text: `${String(cargo.mes).padStart(2, '0')}/${cargo.anio}`, width: 80 },
          { text: formatCurrency(cargo.valor), width: 100, align: 'right' },
          { text: ESTADOS[cargo.estado] || cargo.estado, width: 115, align: 'right' },
        ]);
      });
    }

    if (estado.multas.length > 0) {
      seccion(doc, 'Multas');
      fila(doc, [{ text: 'Motivo', width: 200 }, { text: 'Fecha', width: 80 }, { text: 'Valor', width: 100, align: 'right' }, { text: 'Estado', width: 115, align: 'right' }], { bold: true, color: '#475569' });
      estado.multas.forEach((multa) => {
        fila(doc, [
          { text: multa.motivo_nombre, width: 200 },
          { text: new Date(multa.fecha).toLocaleDateString('es-EC'), width: 80 },
          { text: formatCurrency(multa.monto), width: 100, align: 'right' },
          { text: ESTADOS[multa.estado] || multa.estado, width: 115, align: 'right' },
        ]);
      });
    }

    doc.moveDown(2);
    doc.fontSize(8).fillColor('#64748b').text('Documento informativo generado por Casales App.', 50, doc.y, { align: 'center', width: 495 });
  });
}

function buildCertificadoNumero(certificado) {
  return `PYS-${new Date(certificado.created_at).getFullYear()}-${String(certificado.id).padStart(5, '0')}`;
}

function buildPazYSalvoPdf(certificado) {
  return renderPdf((doc) => {
    header(doc, 'Certificado de paz y salvo', `No. ${buildCertificadoNumero(certificado)}`);

    doc.moveDown(1);
    doc.fontSize(12).fillColor('#111827').text(
      `La administracion del ${CONJUNTO} certifica que el departamento ${certificado.departamento_numero} `
      + `de la Torre ${certificado.torre_numero}`
      + (certificado.titular ? `, a nombre de ${certificado.titular},` : '')
      + ` se encuentra al dia en el pago de alicuotas, multas y cargos extraordinarios a la fecha de emision `
      + 'de este documento.',
      { align: 'justify', lineGap: 4 }
    );

    doc.moveDown(1);
    doc.text('Se extiende el presente certificado a peticion del interesado para los fines que estime convenientes.', {
      align: 'justify',
      lineGap: 4,
    });

    doc.moveDown(2);
    doc.fontSize(11).text(`Fecha de emision: ${formatDate(certificado.created_at)}`);
    doc.text(`Emitido por: ${certificado.emitido_por_nombre || 'Administracion'}`);

    doc.moveDown(5);
    doc.moveTo(200, doc.y).lineTo(395, doc.y).strokeColor('#94a3b8').stroke();
    doc.moveDown(0.4);
    doc.fontSize(10).fillColor('#475569').text('Tesoreria / Administracion', { align: 'center' });

    doc.moveDown(4);
    doc.fontSize(8).fillColor('#64748b').text(
      'La validez de este certificado se limita a la fecha de emision. Puede verificarse con la administracion del conjunto.',
      { align: 'center' }
    );
  });
}

module.exports = { buildEstadoCuentaPdf, buildPazYSalvoPdf, buildCertificadoNumero };
