const express = require('express');
const morosidadController = require('../controllers/morosidad.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');

const router = express.Router();

router.get('/', authenticateToken, authorizeRoles('tesorero'), morosidadController.list);

module.exports = router;
