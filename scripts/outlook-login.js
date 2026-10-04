// Autoriza una sola vez el correo emisor de Outlook (OAuth2). La sesion queda guardada en la base
// y la API la renueva sola. Repetir solo si Microsoft la revoca o pasan 90 dias sin enviar correos.
require('dotenv').config({ override: true });

const { pool } = require('../src/config/database');
const outlookOAuth = require('../src/services/outlook-oauth.service');

async function main() {
  const deviceCode = await outlookOAuth.requestDeviceCode();

  console.log('\nPara autorizar el envio de correos:');
  console.log(`  1. Abre ${deviceCode.verification_uri}`);
  console.log(`  2. Escribe el codigo: ${deviceCode.user_code}`);
  console.log('  3. Inicia sesion con el correo de Outlook que enviara los mensajes y acepta los permisos.\n');
  console.log('Esperando el inicio de sesion...');

  await outlookOAuth.waitForDeviceLogin(deviceCode);

  const cuenta = await outlookOAuth.getAccountEmail();
  const esperado = String(process.env.SMTP_USER || '').trim();

  console.log(`Correo autorizado: ${cuenta}`);

  if (esperado && cuenta.toLowerCase() !== esperado.toLowerCase()) {
    console.warn(`ATENCION: SMTP_USER es ${esperado}. Debe ser el mismo correo que autorizaste; corrige el .env.`);
  }
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
