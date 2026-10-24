const express = require('express');
const documentosController = require('../controllers/documentos.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');
const { ADMINS } = require('../config/permisos');

const router = express.Router();

// Cualquier usuario con sesion consulta los documentos que le corresponden; solo la administracion los sube o borra.
router.use(authenticateToken);

router.get('/', documentosController.list);
router.get('/:id/enlace', documentosController.enlace);
router.post('/', authorizeRoles(ADMINS), documentosController.create);
router.delete('/:id', authorizeRoles(ADMINS), documentosController.remove);

module.exports = router;
