const express = require('express');
const multasController = require('../controllers/multas.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');
const { publicWriteLimiter } = require('../middlewares/rateLimits');
const { verifyCaptcha } = require('../middlewares/captcha');

const router = express.Router();

const lectura = authorizeRoles('admin_general', 'admin_conjunto', 'tesorero', 'condomino');
const gestion = authorizeRoles('admin_general', 'admin_conjunto', 'tesorero');

router.get('/motivos', authenticateToken, lectura, multasController.listMotivos);
router.get('/pagos', authenticateToken, gestion, multasController.listPagos);
router.post('/pagos', publicWriteLimiter, verifyCaptcha, multasController.createPago);
router.put('/pagos/:id/aprobar', authenticateToken, gestion, multasController.approvePago);
router.put('/pagos/:id/rechazar', authenticateToken, gestion, multasController.rejectPago);
router.get('/', authenticateToken, lectura, multasController.list);
router.get('/:id', authenticateToken, lectura, multasController.getById);
router.post('/', authenticateToken, gestion, multasController.create);
router.put('/:id', authenticateToken, gestion, multasController.update);
router.delete('/:id', authenticateToken, gestion, multasController.remove);

module.exports = router;
