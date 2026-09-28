const express = require('express');
const facturasController = require('../controllers/facturas.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');

const router = express.Router();

router.get('/verificar-smtp', authenticateToken, authorizeRoles('admin_general'), facturasController.verifySmtp);

module.exports = router;
