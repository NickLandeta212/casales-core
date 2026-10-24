const express = require('express');
const solicitudesController = require('../controllers/solicitudes.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');
const { GESTION } = require('../config/permisos');
const { portalWriteLimiter } = require('../middlewares/rateLimits');

const router = express.Router();

router.use(authenticateToken);

// Envian solicitudes el condomino, el tesorero y la guardia. Las del conjunto las atiende la administracion;
// las de una torre, su tesorero.
router.get('/', authorizeRoles(GESTION, 'condomino', 'guardia'), solicitudesController.list);
router.get('/destinos', authorizeRoles('condomino', 'tesorero', 'guardia'), solicitudesController.destinos);
router.get('/fotos/:archivo/enlace', authorizeRoles(GESTION, 'condomino', 'guardia'), solicitudesController.enlaceFoto);
router.post('/', authorizeRoles('condomino', 'tesorero', 'guardia'), portalWriteLimiter, solicitudesController.create);
router.put('/:id', authorizeRoles(GESTION), solicitudesController.atender);

module.exports = router;
