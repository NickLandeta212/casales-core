const express = require('express');
const presupuestosController = require('../controllers/presupuestos.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');
const { GESTION } = require('../config/permisos');

const router = express.Router();

router.use(authenticateToken, authorizeRoles(GESTION));

router.get('/', presupuestosController.resumen);
router.put('/', presupuestosController.guardar);

module.exports = router;
