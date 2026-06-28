require('dotenv').config({ override: true });

const correoService = require('../src/services/correo.service');

async function main() {
  const recipient = String(process.argv[2] || process.env.TEST_EMAIL_TO || '').trim();

  if (!recipient) {
    throw new Error('Uso: npm run mail:test -- correo@destino.com');
  }

  const smtp = await correoService.verifySmtpConnection();
  console.log(`SMTP OK: ${smtp.host}:${smtp.port} (${smtp.user})`);

  const result = await correoService.sendFacturaByEmail({
    email_destinatario: recipient,
    asunto: 'Prueba de factura Casales',
    mensaje: '<p>Este es un correo de prueba para validar el envio obligatorio de facturas.</p>',
    factura: {
      numero: `PRUEBA-${Date.now()}`,
      cliente: 'Cliente de prueba',
      fecha: new Date().toISOString(),
    },
    items: [
      {
        descripcion: 'Prueba de envio de factura',
        cantidad: 1,
        precio: 1,
      },
    ],
    total: 1,
  });

  console.log('Factura de prueba enviada correctamente.');
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
