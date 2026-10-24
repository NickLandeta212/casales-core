const mantenimientoModel = require('../models/mantenimiento.model');
const avisosService = require('./avisos.service');
const { escapeHtml } = require('./correo.service');
const { ADMINS } = require('../config/permisos');

// Recordatorio de mantenimientos: revisa cada pocas horas y avisa por correo a la administracion
// de los mantenimientos que entraron en su ventana de aviso. Cada fecha se avisa una sola vez
// (columna aviso_enviado_para), asi que reiniciar el servidor no repite correos.
const INTERVALO_MS = 6 * 60 * 60 * 1000;
const PRIMERA_REVISION_MS = 60 * 1000;

function describir(m) {
  const cuando = m.dias_restantes < 0
    ? `atrasado ${-m.dias_restantes} dia(s)`
    : m.dias_restantes === 0 ? 'hoy' : `en ${m.dias_restantes} dia(s)`;
  return `${m.titulo}${m.area ? ` (${m.area})` : ''}: ${m.proxima_fecha}, ${cuando}${m.proveedor_nombre ? ` - ${m.proveedor_nombre}` : ''}`;
}

async function revisarMantenimientos() {
  const pendientes = await mantenimientoModel.findPendientesDeAviso();

  if (pendientes.length === 0) {
    return 0;
  }

  const lineas = pendientes.map(describir);
  const enviados = await avisosService.enviarAviso(ADMINS, {
    asunto: `Mantenimientos programados: ${pendientes.length} por atender`,
    mensaje: `Estos mantenimientos estan proximos o atrasados:\n\n${lineas.join('\n')}\n\nRegistralos como realizados en la app.`,
    html: `<p>Estos mantenimientos estan proximos o atrasados:</p><ul>${lineas.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`
      + '<p>Registralos como realizados en la app.</p>',
  });

  // Si no salio ningun correo (SMTP caido o sin destinatarios) se reintenta en la proxima revision.
  if (enviados > 0) {
    await mantenimientoModel.marcarAvisoEnviado(pendientes.map((m) => m.id));
  }

  return enviados;
}

function iniciarRecordatorios() {
  const ejecutar = () => revisarMantenimientos().catch((error) => {
    console.error('Fallo la revision de mantenimientos:', error.message);
  });

  setTimeout(ejecutar, PRIMERA_REVISION_MS).unref();
  setInterval(ejecutar, INTERVALO_MS).unref();
}

module.exports = { iniciarRecordatorios, revisarMantenimientos };
