const express = require('express');
const morosidadController = require('../controllers/morosidad.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');
const { GESTION } = require('../config/permisos');

const router = express.Router();

router.get('/', authenticateToken, authorizeRoles(GESTION), morosidadController.list);

module.exports = router;
