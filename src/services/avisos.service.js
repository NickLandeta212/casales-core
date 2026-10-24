const usuarioModel = require('../models/usuario.model');
const correoService = require('./correo.service');

// Envio de avisos por correo a un grupo de usuarios (uno por uno, para no exponer los correos de los demas).
// Nunca lanza: un correo que falla se registra en consola y no detiene a los demas.
// Devuelve cuantos correos se enviaron.
async function enviarAviso(roles, { asunto, mensaje, html, attachments }) {
  let destinatarios = [];

  try {
    destinatarios = await usuarioModel.findCorreosParaAvisos(roles);
  } catch (error) {
    console.error('No se pudieron obtener los destinatarios del aviso:', error.message);
    return 0;
  }

  let enviados = 0;

  for (const email of destinatarios) {
    try {
      await correoService.sendCorreoSimple({ email_destinatario: email, asunto, mensaje, html, attachments });
      enviados += 1;
    } catch (error) {
      console.error(`No se pudo enviar el aviso "${asunto}" a ${email}: ${error.message}`);
    }
  }

  return enviados;
}

module.exports = { enviarAviso };
