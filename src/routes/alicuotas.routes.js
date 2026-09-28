const express = require('express');
const alicuotasController = require('../controllers/alicuotas.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');
const { ADMINS, GESTION } = require('../config/permisos');

const router = express.Router();

const auth = authenticateToken;
// Los pagos de cada departamento los revisa exclusivamente el tesorero de su torre.
const tesoreria = authorizeRoles('tesorero');

// Valor de la alicuota por anio y torre
router.get('/valores', auth, authorizeRoles(GESTION), alicuotasController.listValores);
router.put('/valores', auth, authorizeRoles(ADMINS), alicuotasController.upsertValor);
router.delete('/valores/:id', auth, authorizeRoles(ADMINS), alicuotasController.removeValor);

// Pagos de departamentos (los envia el condomino desde /mi-cuenta)
router.get('/torres/:torreId/departamentos/:departamentoId', auth, tesoreria, alicuotasController.listMesesDepartamento);
router.get('/pagos', auth, tesoreria, alicuotasController.listPagos);
router.put('/pagos/:id/aprobar', auth, tesoreria, alicuotasController.approvePago);
router.put('/pagos/:id/rechazar', auth, tesoreria, alicuotasController.rejectPago);

// Pagos que cada torre hace al conjunto: los envia tesoreria y los revisa la administracion
router.get('/torres/:torreId/meses', auth, authorizeRoles(GESTION), alicuotasController.listMesesTorre);
router.post('/pagos-torres', auth, authorizeRoles(GESTION), alicuotasController.createPagoTorre);
router.get('/pagos-torres', auth, authorizeRoles(ADMINS), alicuotasController.listPagosTorres);
router.put('/pagos-torres/:id/aprobar', auth, authorizeRoles(ADMINS), alicuotasController.approvePagoTorre);
router.put('/pagos-torres/:id/rechazar', auth, authorizeRoles(ADMINS), alicuotasController.rejectPagoTorre);

module.exports = router;
