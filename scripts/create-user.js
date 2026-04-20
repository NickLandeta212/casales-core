const upsertUser = require('./lib/upsert-user');

const USER_NAME = process.env.USER_NAME || 'Usuario Sistema';
const USER_LOGIN = process.env.USER_LOGIN || process.env.USER_EMAIL;
const USER_PASSWORD = process.env.USER_PASSWORD;
const USER_ROLE = process.env.USER_ROLE || 'condomino';

async function run() {
  if (!USER_LOGIN || !USER_PASSWORD) {
    throw new Error('USER_LOGIN (o USER_EMAIL) y USER_PASSWORD son obligatorios');
  }

  if (!['admin_general', 'admin_conjunto', 'condomino'].includes(USER_ROLE)) {
    throw new Error('USER_ROLE invalido. Usa admin_general, admin_conjunto o condomino');
  }

  const result = await upsertUser({
    nombre: USER_NAME,
    email: USER_LOGIN,
    password: USER_PASSWORD,
    role: USER_ROLE,
  });

  console.log('Usuario creado o actualizado');
  console.log(result);
}

run()
  .catch((error) => {
    console.error('Error al crear usuario:', error.message);
    process.exitCode = 1;
  });
