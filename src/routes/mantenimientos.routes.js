const express = require('express');
const mantenimientosController = require('../controllers/mantenimientos.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');
const { ADMINS } = require('../config/permisos');

const router = express.Router();

// El calendario de mantenimiento del conjunto lo lleva la administracion.
router.use(authenticateToken, authorizeRoles(ADMINS));

router.get('/', mantenimientosController.list);
router.get('/proximos', mantenimientosController.proximos);
router.get('/:id/ejecuciones', mantenimientosController.ejecuciones);
router.post('/', mantenimientosController.create);
router.put('/:id', mantenimientosController.update);
router.post('/:id/realizar', mantenimientosController.realizar);

module.exports = router;
