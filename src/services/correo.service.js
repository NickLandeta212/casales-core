const nodemailer = require('nodemailer');
const HttpError = require('../utils/httpError');
const facturaPdfService = require('./factura-pdf.service');

let cachedTransporter = null;

const SMTP_PRESETS = {
  gmail: { host: 'smtp.gmail.com', port: 587, secure: false },
  google: { host: 'smtp.gmail.com', port: 587, secure: false },
  outlook: { host: 'smtp.office365.com', port: 587, secure: false },
  hotmail: { host: 'smtp.office365.com', port: 587, secure: false },
  live: { host: 'smtp.office365.com', port: 587, secure: false },
  office365: { host: 'smtp.office365.com', port: 587, secure: false },
  yahoo: { host: 'smtp.mail.yahoo.com', port: 465, secure: true },
  zoho: { host: 'smtp.zoho.com', port: 587, secure: false },
};

function inferSmtpPreset(user, service) {
  const explicitService = String(service || '').trim().toLowerCase();

  if (SMTP_PRESETS[explicitService]) {
    return SMTP_PRESETS[explicitService];
  }

  const domain = String(user || '').split('@')[1]?.toLowerCase() || '';
  const provider = domain.split('.')[0];

  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    return SMTP_PRESETS.gmail;
  }

  if (['outlook.com', 'hotmail.com', 'live.com'].includes(domain)) {
    return SMTP_PRESETS.outlook;
  }

  if (domain === 'yahoo.com' || domain === 'yahoo.com.ec') {
    return SMTP_PRESETS.yahoo;
  }

  if (domain === 'zoho.com' || domain === 'zohomail.com') {
    return SMTP_PRESETS.zoho;
  }

  return SMTP_PRESETS[provider] || null;
}

function getSmtpConfig() {
  const service = String(process.env.SMTP_SERVICE || '').trim().toLowerCase();
  const user = String(process.env.SMTP_USER || '').trim();
  const password = String(process.env.SMTP_PASS || '').trim();
  const preset = inferSmtpPreset(user, service);
  const host = String(process.env.SMTP_HOST || preset?.host || '').trim();
  const port = parseSmtpPort(preset?.port);
  const defaultSecure = preset?.secure ?? port === 465;
  const secure = String(process.env.SMTP_SECURE || (defaultSecure ? 'true' : 'false')).toLowerCase() === 'true';
  const missing = [];

  if (!host) {
    missing.push('SMTP_HOST');
  }

  if (!user) {
    missing.push('SMTP_USER');
  }

  if (!password) {
    missing.push('SMTP_PASS');
  }

  if (missing.length > 0) {
    throw new HttpError(503, `No se puede enviar facturas: faltan variables SMTP (${missing.join(', ')}). Configura SMTP_USER y SMTP_PASS del correo emisor; para proveedores no reconocidos agrega SMTP_HOST.`);
  }

  return { host, port, secure, user, password };
}

function parseSmtpPort(defaultPort = 587) {
  const port = Number(process.env.SMTP_PORT || defaultPort);

  if (!Number.isInteger(port) || port <= 0) {
    throw new HttpError(503, 'SMTP_PORT debe ser un entero valido');
  }

  return port;
}

function createTransporter() {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  const config = getSmtpConfig();

  cachedTransporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.password,
    },
  });

  return cachedTransporter;
}

function normalizeEmail(email) {
  const normalizedEmail = String(email || '').trim();

  if (!normalizedEmail) {
    throw new HttpError(400, 'email_destinatario es requerido');
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new HttpError(400, 'email_destinatario debe ser un correo valido');
  }

  return normalizedEmail;
}

async function verifySmtpConnection() {
  const config = getSmtpConfig();
  const transporter = createTransporter();

  try {
    await transporter.verify();

    return {
      ok: true,
      host: config.host,
      port: config.port,
      user: config.user,
    };
  } catch (error) {
    throw new HttpError(503, `No se pudo conectar al SMTP: ${error.message}`);
  }
}

function parseInvoiceItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  return items
    .map((item) => ({
      descripcion: String(item?.descripcion || item?.name || '').trim(),
      cantidad: Number(item?.cantidad ?? item?.quantity ?? 1),
      precio: Number(item?.precio ?? item?.price ?? 0),
    }))
    .filter((item) => item.descripcion.length > 0 && Number.isFinite(item.cantidad) && item.cantidad > 0 && Number.isFinite(item.precio) && item.precio >= 0);
}

function buildInvoiceHtml({ factura, items, total }) {
  const invoiceNumber = String(factura?.numero || factura?.invoice_number || 'Factura').trim();
  const clientName = String(factura?.cliente || factura?.customer || '').trim();
  const issueDate = String(factura?.fecha || factura?.issue_date || '').trim();

  const rows = items.length > 0
    ? items.map((item) => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${item.descripcion}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">${item.cantidad}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">$${item.precio.toFixed(2)}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">$${(item.cantidad * item.precio).toFixed(2)}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="4" style="padding:8px;border-bottom:1px solid #e5e7eb;">No se incluyeron detalles de la factura.</td></tr>';

  return `
    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5;max-width:720px;margin:0 auto;">
      <h2 style="margin:0 0 12px;">${invoiceNumber}</h2>
      <p style="margin:0 0 6px;"><strong>Cliente:</strong> ${clientName || 'N/A'}</p>
      <p style="margin:0 0 18px;"><strong>Fecha:</strong> ${issueDate || 'N/A'}</p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb;">Descripcion</th>
            <th style="text-align:right;padding:8px;border-bottom:1px solid #e5e7eb;">Cantidad</th>
            <th style="text-align:right;padding:8px;border-bottom:1px solid #e5e7eb;">Precio</th>
            <th style="text-align:right;padding:8px;border-bottom:1px solid #e5e7eb;">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <div style="display:flex;justify-content:flex-end;margin-top:16px;font-size:16px;">
        <strong>Total: $${Number(total || 0).toFixed(2)}</strong>
      </div>
    </div>
  `;
}

function normalizeAttachments(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return [];
  }

  return attachments
    .map((attachment, index) => {
      const filename = String(attachment?.filename || attachment?.name || `adjunto-${index + 1}`).trim();
      const contentType = String(attachment?.contentType || attachment?.mimeType || 'application/octet-stream').trim();

      if (attachment?.content_base64) {
        return {
          filename,
          content: Buffer.from(String(attachment.content_base64), 'base64'),
          contentType,
        };
      }

      if (attachment?.path) {
        return {
          filename,
          path: String(attachment.path),
          contentType,
        };
      }

      return null;
    })
    .filter(Boolean);
}

async function sendFacturaByEmail({ email_destinatario, asunto, factura, items, total, mensaje, attachments, pdf_base64, pdf_buffer, pdf_filename }) {
  const recipient = normalizeEmail(email_destinatario);
  const transporter = createTransporter();
  const normalizedItems = parseInvoiceItems(items);
  const invoiceTotal = Number.isFinite(Number(total)) ? Number(total) : normalizedItems.reduce((sum, item) => sum + item.cantidad * item.precio, 0);
  const invoiceAttachments = normalizeAttachments(attachments);

  if (pdf_buffer) {
    invoiceAttachments.push({
      filename: String(pdf_filename || 'factura.pdf').trim() || 'factura.pdf',
      content: Buffer.isBuffer(pdf_buffer) ? pdf_buffer : Buffer.from(pdf_buffer),
      contentType: 'application/pdf',
    });
  }

  if (pdf_base64) {
    invoiceAttachments.push({
      filename: String(pdf_filename || 'factura.pdf').trim() || 'factura.pdf',
      content: Buffer.from(String(pdf_base64), 'base64'),
      contentType: 'application/pdf',
    });
  }

  const html = buildInvoiceHtml({ factura, items: normalizedItems, total: invoiceTotal });
  const subject = String(asunto || factura?.asunto || `Factura ${factura?.numero || ''}`).trim() || 'Factura adjunta';

  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: recipient,
      subject,
      text: String(mensaje || factura?.mensaje || 'Adjuntamos su factura.'),
      html: `${String(mensaje || factura?.mensaje || '<p>Adjuntamos su factura.</p>')}<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;"/>${html}`,
      attachments: invoiceAttachments,
    });

    if (Array.isArray(info.rejected) && info.rejected.length > 0) {
      throw new Error(`Destinatarios rechazados: ${info.rejected.join(', ')}`);
    }

    return {
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
      envelope: info.envelope,
    };
  } catch (error) {
    throw new HttpError(502, `No se pudo enviar el correo: ${error.message}`);
  }
}

async function sendCorreoSimple({ email_destinatario, asunto, mensaje, html }) {
  const recipient = normalizeEmail(email_destinatario);
  const transporter = createTransporter();
  const subject = String(asunto || '').trim();

  if (!subject) {
    throw new HttpError(400, 'asunto es requerido');
  }

  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: recipient,
      subject,
      text: String(mensaje || '').trim(),
      html: String(html || mensaje || '').trim(),
    });

    if (Array.isArray(info.rejected) && info.rejected.length > 0) {
      throw new Error(`Destinatarios rechazados: ${info.rejected.join(', ')}`);
    }

    return {
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
      envelope: info.envelope,
    };
  } catch (error) {
    throw new HttpError(502, `No se pudo enviar el correo: ${error.message}`);
  }
}

async function sendPagoAlicuotaFacturaEmail({ pago }) {
  if (!pago) {
    throw new HttpError(400, 'pago es requerido');
  }

  const recipient = String(pago.email_destinatario || pago.usuario_email || '').trim();

  if (!recipient) {
    throw new HttpError(400, 'El pago no tiene un correo de destinatario asociado');
  }

  const pdfBuffer = await facturaPdfService.buildAlicuotaFacturaPdf(pago);
  const invoiceNumber = facturaPdfService.buildAlicuotaInvoiceNumber(pago);

  return sendFacturaByEmail({
    email_destinatario: recipient,
    asunto: `Factura aprobada ${invoiceNumber}`,
    mensaje: `Su pago de alicuota ${invoiceNumber} fue aprobado correctamente.`,
    factura: {
      numero: invoiceNumber,
      cliente: pago.usuario_nombre || pago.email_destinatario || 'Titular del departamento',
      fecha: pago.aprobado_at || pago.fecha_pago,
      asunto: `Factura aprobada ${invoiceNumber}`,
      mensaje: `Su pago de alicuota ${invoiceNumber} fue aprobado correctamente.`,
    },
    items: [
      {
        descripcion: String(pago.descripcion || `Alicuota mes ${pago.mes || ''}`).trim(),
        cantidad: 1,
        precio: Number(pago.valor || 0),
      },
    ],
    total: Number(pago.valor || 0),
    pdf_buffer: pdfBuffer,
    pdf_filename: `${invoiceNumber}.pdf`,
  });
}

async function sendPagoMultaFacturaEmail({ pago }) {
  if (!pago) {
    throw new HttpError(400, 'pago es requerido');
  }

  const recipient = String(pago.email_destinatario || '').trim();

  if (!recipient) {
    throw new HttpError(400, 'El pago no tiene un correo de destinatario asociado');
  }

  const pdfBuffer = await facturaPdfService.buildMultaFacturaPdf(pago);
  const invoiceNumber = facturaPdfService.buildMultaInvoiceNumber(pago);
  const detalles = Array.isArray(pago.multas) ? pago.multas : [];

  return sendFacturaByEmail({
    email_destinatario: recipient,
    asunto: `Factura aprobada ${invoiceNumber}`,
    mensaje: `Su pago de multas ${invoiceNumber} fue aprobado correctamente.`,
    factura: {
      numero: invoiceNumber,
      cliente: recipient,
      fecha: pago.updated_at || pago.created_at,
      asunto: `Factura aprobada ${invoiceNumber}`,
      mensaje: `Su pago de multas ${invoiceNumber} fue aprobado correctamente.`,
    },
    items: detalles.map((detalle) => ({
      descripcion: String(detalle.motivo_nombre || detalle.descripcion || 'Multa registrada').trim(),
      cantidad: 1,
      precio: Number(detalle.monto || 0),
    })),
    total: Number(pago.total || 0),
    pdf_buffer: pdfBuffer,
    pdf_filename: `${invoiceNumber}.pdf`,
  });
}

async function sendUsuarioCreadoEmail({ usuario, passwordTemporal }) {
  if (!usuario) {
    throw new HttpError(400, 'usuario es requerido');
  }

  const recipient = normalizeEmail(usuario.email);
  const nombre = String(usuario.nombre || 'Usuario').trim();
  const role = String(usuario.role || '').trim();
  const loginUrl = String(process.env.PUBLIC_APP_URL || '').trim() || 'http://localhost:4200';
  const passwordLine = passwordTemporal
    ? `<p><strong>Contrasena temporal:</strong> ${String(passwordTemporal)}</p>`
    : '';
  const textPasswordLine = passwordTemporal
    ? `\nContrasena temporal: ${String(passwordTemporal)}`
    : '';

  return sendCorreoSimple({
    email_destinatario: recipient,
    asunto: 'Cuenta creada en Casales San Pedro',
    mensaje: `Hola ${nombre}, tu cuenta fue creada correctamente en Casales San Pedro.
Correo: ${recipient}
Rol: ${role || 'Usuario'}${textPasswordLine}
Ingresa desde: ${loginUrl}`,
    html: `
      <p>Hola ${nombre},</p>
      <p>Tu cuenta fue creada correctamente en Casales San Pedro.</p>
      <p><strong>Correo:</strong> ${recipient}</p>
      <p><strong>Rol:</strong> ${role || 'Usuario'}</p>
      ${passwordLine}
      <p>Puedes ingresar desde: <a href="${loginUrl}">${loginUrl}</a></p>
    `,
  });
}

module.exports = { verifySmtpConnection, sendFacturaByEmail, sendCorreoSimple, sendPagoAlicuotaFacturaEmail, sendPagoMultaFacturaEmail, sendUsuarioCreadoEmail };
