const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth.routes');
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

app.use(express.json());

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

// 404
app.use((req, res) => {
  res.status(404).json({ message: 'Ruta no encontrada' });
});

// Manejo de errores
app.use(errorHandler);

module.exports = app;