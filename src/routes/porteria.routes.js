const express = require('express');
const porteriaController = require('../controllers/porteria.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');
const { ADMINS } = require('../config/permisos');
const { portalWriteLimiter } = require('../middlewares/rateLimits');

const router = express.Router();

const residente = authorizeRoles('condomino');
const guardia = authorizeRoles(ADMINS, 'guardia');
const todos = authorizeRoles(ADMINS, 'guardia', 'condomino');

router.use(authenticateToken);

router.get('/departamentos', guardia, porteriaController.listDepartamentos);

// Visitas: las anuncia el residente y la guardia confirma el ingreso.
router.get('/visitas', todos, porteriaController.listVisitas);
router.post('/visitas', residente, portalWriteLimiter, porteriaController.createVisita);
router.put('/visitas/:id/cancelar', residente, porteriaController.cancelarVisita);
router.put('/visitas/:id/ingreso', guardia, porteriaController.ingresoVisita);

// Paquetes: los registra y entrega la guardia; el residente ve los suyos.
router.get('/paquetes', todos, porteriaController.listPaquetes);
router.post('/paquetes', guardia, porteriaController.createPaquete);
router.put('/paquetes/:id/entregar', guardia, porteriaController.entregarPaquete);

module.exports = router;
