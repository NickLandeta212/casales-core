const express = require('express');
const miCuentaController = require('../controllers/mi-cuenta.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');
const { portalWriteLimiter } = require('../middlewares/rateLimits');

// Portal de pagos del condomino.
const router = express.Router();

router.use(authenticateToken, authorizeRoles('condomino'));

router.get('/estado', miCuentaController.estado);
router.post('/pagos/alicuotas', portalWriteLimiter, miCuentaController.pagarAlicuotas);
router.post('/pagos/multas', portalWriteLimiter, miCuentaController.pagarMultas);
router.get('/pagos/alicuotas/:id/factura', miCuentaController.facturaAlicuota);
router.get('/pagos/multas/:id/factura', miCuentaController.facturaMultas);

module.exports = router;
