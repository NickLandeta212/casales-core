const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const authRoutes = require('./routes/auth.routes');
const torresRoutes = require('./routes/torres.routes');
const departamentosRoutes = require('./routes/departamentos.routes');
const personasRoutes = require('./routes/personas.routes');
const multasRoutes = require('./routes/multas.routes');
const alicuotasRoutes = require('./routes/alicuotas.routes');
const reservasRoutes = require('./routes/reservas.routes');
const facturasRoutes = require('./routes/facturas.routes');
const usuariosRoutes = require('./routes/usuarios.routes');
const publicRoutes = require('./routes/public.routes');
const auditoriaRoutes = require('./routes/auditoria.routes');
const finanzasRoutes = require('./routes/finanzas.routes');
const accesosRoutes = require('./routes/accesos.routes');
const miCuentaRoutes = require('./routes/mi-cuenta.routes');
const comprobantesRoutes = require('./routes/comprobantes.routes');
const comunicadosRoutes = require('./routes/comunicados.routes');
const solicitudesRoutes = require('./routes/solicitudes.routes');
const morosidadRoutes = require('./routes/morosidad.routes');
const auditTrail = require('./middlewares/auditTrail');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

if (process.env.TRUST_PROXY) {
  const trustProxy = Number(process.env.TRUST_PROXY);
  app.set('trust proxy', Number.isInteger(trustProxy) ? trustProxy : process.env.TRUST_PROXY);
}

const corsOrigins = String(process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

app.use(
  cors({
    origin: corsOrigins.length > 0 ? corsOrigins : false,
  })
);

app.use(express.json({ limit: '6mb' }));

// Ruta base
app.get('/', (req, res) => {
  res.json({
    message: 'API funcionando',
    auth: '/api/v1/auth',
    health: '/api/v1/health',
  });
});

// Health check
app.get('/api/v1/health', (req, res) => {
  res.json({ ok: true });
});

// Registra cada cambio exitoso en la tabla auditoria
app.use(auditTrail);

// Auth
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/torres', torresRoutes);
app.use('/api/v1/departamentos', departamentosRoutes);
app.use('/api/v1/personas', personasRoutes);
app.use('/api/v1/multas', multasRoutes);
app.use('/api/v1/alicuotas', alicuotasRoutes);
app.use('/api/v1/reservas', reservasRoutes);
app.use('/api/v1/facturas', facturasRoutes);
app.use('/api/v1/usuarios', usuariosRoutes);
app.use('/api/v1/public', publicRoutes);
app.use('/api/v1/auditoria', auditoriaRoutes);
app.use('/api/v1/finanzas', finanzasRoutes);
app.use('/api/v1/accesos', accesosRoutes);
app.use('/api/v1/mi-cuenta', miCuentaRoutes);
app.use('/api/v1/comprobantes', comprobantesRoutes);
app.use('/api/v1/comunicados', comunicadosRoutes);
app.use('/api/v1/solicitudes', solicitudesRoutes);
app.use('/api/v1/morosidad', morosidadRoutes);
// 404
app.use((req, res) => {
  res.status(404).json({ message: 'Ruta no encontrada' });
});

// Manejo de errores
app.use(errorHandler);

module.exports = app;
