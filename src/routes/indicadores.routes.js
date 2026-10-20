const express = require('express');
const indicadoresController = require('../controllers/indicadores.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');
const { GESTION } = require('../config/permisos');

const router = express.Router();

router.get('/', authenticateToken, authorizeRoles(GESTION), indicadoresController.resumen);

module.exports = router;
