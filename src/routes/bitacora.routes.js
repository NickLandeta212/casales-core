const express = require('express');
const bitacoraController = require('../controllers/bitacora.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');
const { ADMINS } = require('../config/permisos');

const router = express.Router();

// La guardia registra las novedades de su turno; la administracion las revisa.
router.use(authenticateToken, authorizeRoles(ADMINS, 'guardia'));

router.get('/', bitacoraController.list);
router.get('/fotos/:archivo/enlace', bitacoraController.enlaceFoto);
router.post('/', authorizeRoles('guardia', 'admin_general'), bitacoraController.create);

module.exports = router;
