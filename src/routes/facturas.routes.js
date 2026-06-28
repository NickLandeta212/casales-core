const express = require('express');
const facturasController = require('../controllers/facturas.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');

const router = express.Router();

router.get('/verificar-smtp', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto', 'tesorero'), facturasController.verifySmtp);
router.post('/enviar-correo', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto', 'tesorero'), facturasController.sendFacturaByEmail);

module.exports = router;
