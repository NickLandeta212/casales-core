const PDFDocument = require('pdfkit');

// Piezas comunes de los PDF del conjunto (encabezado, secciones, filas de tabla y formatos).

const CONJUNTO = process.env.CONJUNTO_NOMBRE || 'Conjunto Habitacional Casales de San Pedro';
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
function formatCurrency(value) {
  return new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
    .format(Number(value) || 0);
}

function formatDate(value) {
  const date = value ? new Date(value) : new Date();
  return new Intl.DateTimeFormat('es-EC', { dateStyle: 'long' }).format(date);
}

// Fecha y hora en la zona del conjunto (Ecuador continental, UTC-5 sin horario de verano).
const ZONA_HORARIA = process.env.CONJUNTO_ZONA_HORARIA || 'America/Guayaquil';

function formatFechaHora(value) {
  return new Intl.DateTimeFormat('es-EC', { dateStyle: 'full', timeStyle: 'short', timeZone: ZONA_HORARIA }).format(new Date(value));
}

function renderPdf(draw) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    draw(doc);
    doc.end();
  });
}

function header(doc, titulo, subtitulo) {
  doc.fillColor('#14532d').fontSize(11).text(CONJUNTO.toUpperCase(), { align: 'center' });
  doc.moveDown(0.4);
  doc.fillColor('#0f172a').fontSize(20).text(titulo, { align: 'center' });

  if (subtitulo) {
    doc.moveDown(0.2);
    doc.fillColor('#475569').fontSize(10).text(subtitulo, { align: 'center' });
  }

  doc.moveDown(1);
}

function seccion(doc, titulo) {
  doc.moveDown(0.8);
  doc.fillColor('#0f172a').fontSize(12).text(titulo, 50, doc.y, { underline: true });
  doc.moveDown(0.4);
}

// Filas de tabla simple: columnas [{ text, width, align }].
function fila(doc, columnas, { bold = false, color = '#111827' } = {}) {
  if (doc.y > 760) {
    doc.addPage();
  }

  const y = doc.y;
  let x = 50;

  columnas.forEach((col) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(color)
      .text(String(col.text ?? ''), x, y, { width: col.width, align: col.align || 'left' });
    x += col.width;
  });

  doc.font('Helvetica');
  doc.y = y + 16;
}

module.exports = { CONJUNTO, MESES, ZONA_HORARIA, formatCurrency, formatDate, formatFechaHora, renderPdf, header, seccion, fila };
