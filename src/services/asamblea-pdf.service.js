const { CONJUNTO, formatDate, formatFechaHora, renderPdf, header } = require('./pdf-base');

const TIPOS = { ordinaria: 'Asamblea ordinaria', extraordinaria: 'Asamblea extraordinaria' };

// Convocatoria oficial con fecha, lugar y orden del dia, lista para imprimir o enviar por correo.
function buildConvocatoriaPdf(asamblea) {
  return renderPdf((doc) => {
    header(doc, 'Convocatoria', TIPOS[asamblea.tipo] || 'Asamblea');

    doc.fontSize(11).fillColor('#111827');
    doc.text(`Fecha de emision: ${formatDate(asamblea.created_at)}`, { align: 'right' });
    doc.moveDown(1);

    doc.fontSize(12).text(
      `La administracion del ${CONJUNTO} convoca a todos los copropietarios a la ${String(TIPOS[asamblea.tipo] || 'asamblea').toLowerCase()} `
      + `"${asamblea.titulo}", que se realizara en la fecha y lugar indicados a continuacion.`,
      { align: 'justify', lineGap: 4 }
    );

    doc.moveDown(1);
    doc.font('Helvetica-Bold').text('Fecha y hora: ', { continued: true }).font('Helvetica').text(formatFechaHora(asamblea.fecha_hora));
    doc.font('Helvetica-Bold').text('Lugar: ', { continued: true }).font('Helvetica').text(asamblea.lugar);

    doc.moveDown(1);
    doc.font('Helvetica-Bold').fontSize(13).text('Orden del dia');
    doc.font('Helvetica').fontSize(11).moveDown(0.4);
    asamblea.orden_del_dia.forEach((punto, index) => {
      doc.text(`${index + 1}. ${punto}`, { indent: 10, lineGap: 3 });
    });

    doc.moveDown(1.5);
    doc.fontSize(10).fillColor('#475569').text(
      'Se recuerda la importancia de su asistencia. Si no puede asistir, puede delegar su representacion por escrito.',
      { align: 'justify' }
    );

    doc.moveDown(5);
    doc.moveTo(200, doc.y).lineTo(395, doc.y).strokeColor('#94a3b8').stroke();
    doc.moveDown(0.4);
    doc.fontSize(10).fillColor('#475569').text(asamblea.creado_por_nombre || 'Administracion', { align: 'center' });
    doc.text('Administracion', { align: 'center' });
  });
}

module.exports = { buildConvocatoriaPdf };
