require('dotenv').config({ override: true });

const app = require('./app');
const { pool } = require('./config/database');

const PORT = Number(process.env.PORT) || 3000;
const ALLOW_START_WITHOUT_DB = process.env.ALLOW_START_WITHOUT_DB === 'true';

async function bootstrap() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change_this_secret') {
    console.warn('JWT_SECRET no es seguro. Configura un valor fuerte en el archivo .env');
  }

  try {
    await pool.query('SELECT 1');
    console.log('Conexion a PostgreSQL OK');
  } catch (error) {
    if (!ALLOW_START_WITHOUT_DB) {
      console.error('No se pudo conectar a PostgreSQL:', error.message);
      process.exit(1);
    }

    console.warn('Servidor iniciado sin validar PostgreSQL:', error.message);
  }

  app.listen(PORT, () => {
    console.log(`Servidor listo en http://0.0.0.0:${PORT}`);
  });
}

bootstrap();
