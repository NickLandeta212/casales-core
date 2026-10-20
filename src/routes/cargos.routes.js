const express = require('express');
const cargosController = require('../controllers/cargos.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');
const { ADMINS, GESTION } = require('../config/permisos');

// Cargos extraordinarios: los emite y revierte la administracion; los pagos los consulta la gestion
// y los aprueba o rechaza el tesorero.
const router = express.Router();

router.use(authenticateToken);

router.get('/emisiones', authorizeRoles(GESTION), cargosController.listEmisiones);
router.post('/emisiones', authorizeRoles(ADMINS), cargosController.createEmision);
router.put('/emisiones/:id/revertir', authorizeRoles(ADMINS), cargosController.revertirEmision);

router.get('/pagos', authorizeRoles(GESTION), cargosController.listPagos);
router.put('/pagos/:id/aprobar', authorizeRoles('tesorero'), cargosController.approvePago);
router.put('/pagos/:id/rechazar', authorizeRoles('tesorero'), cargosController.rejectPago);

module.exports = router;
