const express = require('express');
const encuestasController = require('../controllers/encuestas.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');
const { ADMINS, GESTION } = require('../config/permisos');
const { portalWriteLimiter } = require('../middlewares/rateLimits');

const router = express.Router();

router.use(authenticateToken);

// La administracion crea y cierra; cada departamento vota una vez; tesoreria solo consulta.
router.get('/', authorizeRoles(GESTION, 'condomino'), encuestasController.list);
router.post('/', authorizeRoles(ADMINS), encuestasController.create);
router.put('/:id/cerrar', authorizeRoles(ADMINS), encuestasController.cerrar);
router.delete('/:id', authorizeRoles(ADMINS), encuestasController.remove);
router.post('/:id/votar', authorizeRoles('condomino'), portalWriteLimiter, encuestasController.votar);

module.exports = router;
