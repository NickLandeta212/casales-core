const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const authRoutes = require('./routes/auth.routes');
const torresRoutes = require('./routes/torres.routes');
const departamentosRoutes = require('./routes/departamentos.routes');
const personasRoutes = require('./routes/personas.routes');
const reservasRoutes = require('./routes/reservas.routes');
const usuariosRoutes = require('./routes/usuarios.routes');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Demasiados intentos de autenticacion, intenta mas tarde' },
});

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

app.use(
  cors({
    origin: '*',
  })
);

app.use(express.json({ limit: '6mb' }));
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

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

// Auth
app.use('/api/v1/auth', authLimiter, authRoutes);
app.use('/api/v1/torres', torresRoutes);
app.use('/api/v1/departamentos', departamentosRoutes);
app.use('/api/v1/personas', personasRoutes);
app.use('/api/v1/reservas', reservasRoutes);
app.use('/api/v1/usuarios', usuariosRoutes);
// 404
app.use((req, res) => {
  res.status(404).json({ message: 'Ruta no encontrada' });
});

// Manejo de errores
app.use(errorHandler);

module.exports = app;
