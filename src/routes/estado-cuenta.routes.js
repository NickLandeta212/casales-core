const express = require('express');
const estadoCuentaController = require('../controllers/estado-cuenta.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');
const { GESTION } = require('../config/permisos');

// Estado de cuenta y paz y salvo por departamento: la administracion (todas las torres)
// y el tesorero (sus torres). El condomino descarga el suyo desde /mi-cuenta.
const router = express.Router();

router.use(authenticateToken, authorizeRoles(GESTION));

router.get('/certificados', estadoCuentaController.listCertificados);
router.get('/certificados/:id/pdf', estadoCuentaController.certificadoPdf);
router.get('/departamentos/:id', estadoCuentaController.estado);
router.get('/departamentos/:id/pdf', estadoCuentaController.estadoPdf);
router.post('/departamentos/:id/paz-y-salvo', estadoCuentaController.emitirPazYSalvo);

module.exports = router;
