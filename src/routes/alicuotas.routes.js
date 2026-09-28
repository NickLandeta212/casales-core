const express = require('express');
const alicuotasController = require('../controllers/alicuotas.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');
const { publicWriteLimiter } = require('../middlewares/rateLimits');
const { verifyCaptcha } = require('../middlewares/captcha');
const { ADMINS, GESTION } = require('../config/permisos');

const router = express.Router();

const auth = authenticateToken;
const revisores = authorizeRoles('admin_general', 'tesorero');

// Formulario publico (QR)
router.get('/torres/:torreId/departamentos', alicuotasController.listDepartamentos);
router.get('/torres/:torreId/departamentos/:departamentoId', alicuotasController.listMesesDepartamento);
router.post('/pagos', publicWriteLimiter, verifyCaptcha, alicuotasController.createPago);

// Valor de la alicuota por anio y torre
router.get('/valores', auth, authorizeRoles(GESTION), alicuotasController.listValores);
router.put('/valores', auth, authorizeRoles(ADMINS), alicuotasController.upsertValor);
router.delete('/valores/:id', auth, authorizeRoles(ADMINS), alicuotasController.removeValor);

// Pagos de departamentos: los revisa tesoreria; administracion puede consultarlos para finanzas.
router.get('/pagos', auth, authorizeRoles(GESTION), alicuotasController.listPagos);
router.put('/pagos/:id/aprobar', auth, revisores, alicuotasController.approvePago);
router.put('/pagos/:id/rechazar', auth, revisores, alicuotasController.rejectPago);

// Pagos que cada torre hace al conjunto
router.get('/torres/:torreId/meses', auth, authorizeRoles(GESTION), alicuotasController.listMesesTorre);
router.post('/pagos-torres', auth, authorizeRoles(GESTION), alicuotasController.createPagoTorre);
router.get('/pagos-torres', auth, authorizeRoles(ADMINS), alicuotasController.listPagosTorres);
router.put('/pagos-torres/:id/aprobar', auth, authorizeRoles(ADMINS), alicuotasController.approvePagoTorre);
router.put('/pagos-torres/:id/rechazar', auth, authorizeRoles(ADMINS), alicuotasController.rejectPagoTorre);

module.exports = router;
