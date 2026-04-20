const upsertUser = require('./lib/upsert-user');

const ADMIN_NAME = process.env.ADMIN_NAME || 'Admin General';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@conjunto.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123*';
const ADMIN_ROLE = process.env.ADMIN_ROLE || 'admin_general';

async function run() {
  if (!['admin_general', 'admin_conjunto'].includes(ADMIN_ROLE)) {
    throw new Error('ADMIN_ROLE invalido. Usa admin_general o admin_conjunto');
  }

  const result = await upsertUser({
    nombre: ADMIN_NAME,
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    role: ADMIN_ROLE,
  });

  console.log('Usuario administrador listo');
  console.log(result);
}

run()
  .catch((error) => {
    console.error('Error al crear admin:', error.message);
    process.exitCode = 1;
  });
