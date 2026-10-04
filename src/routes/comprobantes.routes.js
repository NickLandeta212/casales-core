const express = require('express');
const comprobantesController = require('../controllers/comprobantes.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');
const { GESTION } = require('../config/permisos');

const router = express.Router();

// Enlace temporal a la imagen de un comprobante; el controlador valida que le corresponda al usuario.
router.get('/:archivo/enlace', authenticateToken, authorizeRoles(GESTION, 'condomino'), comprobantesController.enlace);

module.exports = router;
