const express = require('express');
const auditoriaController = require('../controllers/auditoria.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');
const { ADMINS } = require('../config/permisos');

const router = express.Router();

router.get('/', authenticateToken, authorizeRoles(ADMINS), auditoriaController.list);

module.exports = router;
