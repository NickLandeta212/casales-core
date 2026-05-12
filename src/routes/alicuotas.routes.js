const express = require('express');
const alicuotasController = require('../controllers/alicuotas.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');

const router = express.Router();

router.get('/torres/:torreId/departamentos', alicuotasController.listDepartamentos);
router.get('/torres/:torreId/departamentos/:departamentoId', alicuotasController.listMesesDepartamento);
router.get('/torres/:torreId/meses', alicuotasController.listMesesTorre);
router.post('/pagos', alicuotasController.createPago);
router.post('/pagos-torres', alicuotasController.createPagoTorre);
router.get('/pagos', authenticateToken, authorizeRoles('admin_general', 'tesorero'), alicuotasController.listPagos);
router.put('/pagos/:id/aprobar', authenticateToken, authorizeRoles('admin_general', 'tesorero'), alicuotasController.approvePago);
router.get('/pagos-torres', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto'), alicuotasController.listPagosTorres);
router.put('/pagos-torres/:id/aprobar', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto'), alicuotasController.approvePagoTorre);

module.exports = router;
