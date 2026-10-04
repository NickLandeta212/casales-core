const express = require('express');
const solicitudesController = require('../controllers/solicitudes.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');
const { GESTION } = require('../config/permisos');
const { portalWriteLimiter } = require('../middlewares/rateLimits');

const router = express.Router();

router.use(authenticateToken);

router.get('/', authorizeRoles(GESTION, 'condomino'), solicitudesController.list);
router.post('/', authorizeRoles('condomino'), portalWriteLimiter, solicitudesController.create);
router.put('/:id', authorizeRoles(GESTION), solicitudesController.atender);

module.exports = router;
