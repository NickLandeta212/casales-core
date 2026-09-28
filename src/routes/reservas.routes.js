const express = require('express');
const reservasController = require('../controllers/reservas.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');
const { publicWriteLimiter } = require('../middlewares/rateLimits');
const { verifyCaptcha } = require('../middlewares/captcha');

const router = express.Router();

router.get('/', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto', 'tesorero', 'condomino'), reservasController.list);
router.post('/', publicWriteLimiter, verifyCaptcha, reservasController.create);
router.post('/:id/comprobante', publicWriteLimiter, reservasController.uploadComprobante);
router.put('/:id/estado', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto'), reservasController.updateEstado);
router.put('/:id/rechazar', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto'), reservasController.reject);

module.exports = router;
