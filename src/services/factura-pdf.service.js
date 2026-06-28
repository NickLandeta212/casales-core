const PDFDocument = require('pdfkit');

function formatCurrency(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return '$0.00';
  }

  return new Intl.NumberFormat('es-EC', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(value) {
  if (!value) {
    return 'N/A';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat('es-EC', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function buildAlicuotaInvoiceNumber(pago) {
  const year = Number.isInteger(Number(pago?.anio)) ? Number(pago.anio) : new Date().getFullYear();
  const month = Number.isInteger(Number(pago?.mes)) ? String(Number(pago.mes)).padStart(2, '0') : '00';
  const department = String(pago?.departamento_numero || pago?.departamento_id || 'PEND').trim();

  return `FAC-${year}-${month}-${department}`;
}

function buildMultaInvoiceNumber(pago) {
  const id = String(pago?.id || 'PEND').trim();
  const department = String(pago?.departamento_numero || pago?.departamento_id || 'DEP').trim();

  return `FAC-MULTA-${department}-${id}`;
}

async function buildAlicuotaFacturaPdf(pago) {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];

    document.on('data', (chunk) => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);

    const invoiceNumber = buildAlicuotaInvoiceNumber(pago);
    const ownerName = String(pago?.usuario_nombre || 'Titular del departamento').trim();
    const ownerEmail = String(pago?.email_destinatario || pago?.usuario_email || '').trim();
    const torreNumero = String(pago?.torre_numero || '').trim();
    const departamentoNumero = String(pago?.departamento_numero || '').trim();
    const descripcion = String(pago?.descripcion || `Alicuota mes ${pago?.mes || ''}`).trim();
    const valor = Number(pago?.valor || 0);

    document.fillColor('#0f172a').fontSize(22).text('Factura de alicuota', { align: 'center' });
    document.moveDown(0.3);
    document.fillColor('#475569').fontSize(10).text(`Numero de factura: ${invoiceNumber}`, { align: 'center' });
    document.moveDown(1.2);

    document.fillColor('#111827').fontSize(13).text('Datos del pago', { underline: true });
    document.moveDown(0.6);

    const leftX = 50;
    const labelWidth = 165;
    const valueX = leftX + labelWidth;
    const startY = document.y;

    const rows = [
      ['Titular', ownerName],
      ['Correo', ownerEmail || 'N/A'],
      ['Torre', torreNumero || 'N/A'],
      ['Departamento', departamentoNumero || 'N/A'],
      ['Periodo', `${String(pago?.mes || '').padStart(2, '0')}/${pago?.anio || 'N/A'}`],
      ['Descripcion', descripcion],
      ['Valor', formatCurrency(valor)],
      ['Estado', String(pago?.estado || 'aprobado').toUpperCase()],
      ['Fecha de aprobacion', formatDate(pago?.aprobado_at || pago?.fecha_pago)],
    ];

    rows.forEach(([label, value], index) => {
      const rowY = startY + index * 22;
      document.fontSize(10).fillColor('#64748b').text(`${label}:`, leftX, rowY, { width: labelWidth });
      document.fillColor('#111827').text(String(value), valueX, rowY, { width: 340 });
    });

    const tableStartY = startY + rows.length * 22 + 24;

    document.moveTo(leftX, tableStartY).lineTo(545, tableStartY).strokeColor('#cbd5e1').stroke();
    document.fillColor('#0f172a').fontSize(12).text('Detalle facturado', leftX, tableStartY + 14);

    const itemY = tableStartY + 40;
    document.roundedRect(leftX, itemY, 495, 60, 8).strokeColor('#e2e8f0').stroke();
    document.fillColor('#111827').fontSize(10).text(descripcion, leftX + 12, itemY + 12, { width: 285 });
    document.fontSize(10).fillColor('#64748b').text('1 unidad', leftX + 320, itemY + 12, { width: 70, align: 'right' });
    document.fillColor('#111827').text(formatCurrency(valor), leftX + 395, itemY + 12, { width: 90, align: 'right' });

    document.fontSize(13).fillColor('#0f172a').text(`Total: ${formatCurrency(valor)}`, leftX, itemY + 84, {
      align: 'right',
      width: 495,
    });

    document.moveDown(3);
    document.fontSize(9).fillColor('#64748b').text('Documento generado automaticamente al aprobar el pago de alicuota.', {
      align: 'center',
    });

    document.end();
  });
}

async function buildMultaFacturaPdf(pago) {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];

    document.on('data', (chunk) => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);

    const invoiceNumber = buildMultaInvoiceNumber(pago);
    const ownerEmail = String(pago?.email_destinatario || '').trim();
    const torreNumero = String(pago?.torre_numero || '').trim();
    const departamentoNumero = String(pago?.departamento_numero || '').trim();
    const total = Number(pago?.total || 0);
    const detalles = Array.isArray(pago?.multas) ? pago.multas : [];

    document.fillColor('#0f172a').fontSize(22).text('Factura de multas', { align: 'center' });
    document.moveDown(0.3);
    document.fillColor('#475569').fontSize(10).text(`Numero de factura: ${invoiceNumber}`, { align: 'center' });
    document.moveDown(1.2);

    document.fillColor('#111827').fontSize(13).text('Datos del pago', { underline: true });
    document.moveDown(0.6);

    const leftX = 50;
    const labelWidth = 165;
    const valueX = leftX + labelWidth;
    const startY = document.y;
    const rows = [
      ['Correo', ownerEmail || 'N/A'],
      ['Torre', torreNumero || 'N/A'],
      ['Departamento', departamentoNumero || 'N/A'],
      ['Estado', String(pago?.estado || 'aprobado').toUpperCase()],
      ['Fecha de aprobacion', formatDate(pago?.updated_at || pago?.created_at)],
    ];

    rows.forEach(([label, value], index) => {
      const rowY = startY + index * 22;
      document.fontSize(10).fillColor('#64748b').text(`${label}:`, leftX, rowY, { width: labelWidth });
      document.fillColor('#111827').text(String(value), valueX, rowY, { width: 340 });
    });

    const tableStartY = startY + rows.length * 22 + 24;
    document.moveTo(leftX, tableStartY).lineTo(545, tableStartY).strokeColor('#cbd5e1').stroke();
    document.fillColor('#0f172a').fontSize(12).text('Detalle facturado', leftX, tableStartY + 14);

    let itemY = tableStartY + 40;
    detalles.forEach((detalle) => {
      const descripcion = String(detalle.motivo_nombre || detalle.descripcion || 'Multa registrada').trim();
      const persona = `${detalle.persona_nombre || ''} ${detalle.persona_apellidos || ''}`.trim();
      const monto = Number(detalle.monto || 0);

      document.roundedRect(leftX, itemY, 495, 50, 8).strokeColor('#e2e8f0').stroke();
      document.fillColor('#111827').fontSize(10).text(descripcion, leftX + 12, itemY + 10, { width: 300 });
      document.fillColor('#64748b').fontSize(9).text(persona || 'Sin persona', leftX + 12, itemY + 26, { width: 300 });
      document.fillColor('#111827').fontSize(10).text(formatCurrency(monto), leftX + 395, itemY + 16, { width: 90, align: 'right' });
      itemY += 58;
    });

    if (detalles.length === 0) {
      document.fillColor('#64748b').fontSize(10).text('No se incluyeron detalles de multas.', leftX, itemY);
      itemY += 28;
    }

    document.fontSize(13).fillColor('#0f172a').text(`Total: ${formatCurrency(total)}`, leftX, itemY + 18, {
      align: 'right',
      width: 495,
    });

    document.moveDown(3);
    document.fontSize(9).fillColor('#64748b').text('Documento generado automaticamente al aprobar el pago de multas.', {
      align: 'center',
    });

    document.end();
  });
}

module.exports = {
  buildAlicuotaFacturaPdf,
  buildAlicuotaInvoiceNumber,
  buildMultaFacturaPdf,
  buildMultaInvoiceNumber,
};
