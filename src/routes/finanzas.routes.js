const express = require('express');
const finanzasController = require('../controllers/finanzas.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');
const { GESTION } = require('../config/permisos');

const router = express.Router();

router.use(authenticateToken, authorizeRoles(GESTION));

router.get('/movimientos', finanzasController.list);
router.post('/movimientos', finanzasController.create);
router.delete('/movimientos/:id', finanzasController.remove);

module.exports = router;
