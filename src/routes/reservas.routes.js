const express = require('express');
const reservasController = require('../controllers/reservas.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');

const router = express.Router();

router.get('/', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto', 'condomino'), reservasController.list);
router.post('/', reservasController.create);
router.post('/:id/comprobante', reservasController.uploadComprobante);
router.put('/:id/estado', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto'), reservasController.updateEstado);

module.exports = router;
