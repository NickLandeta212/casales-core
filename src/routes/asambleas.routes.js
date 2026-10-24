const express = require('express');
const asambleasController = require('../controllers/asambleas.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');
const { ADMINS, GESTION } = require('../config/permisos');

const router = express.Router();

// Las ven la gestion y los departamentos; solo la administracion convoca y cierra.
router.use(authenticateToken, authorizeRoles(GESTION, 'condomino'));

router.get('/', asambleasController.list);
router.get('/:id/convocatoria', asambleasController.convocatoria);
router.post('/', authorizeRoles(ADMINS), asambleasController.create);
router.put('/:id/estado', authorizeRoles(ADMINS), asambleasController.cerrar);

module.exports = router;
