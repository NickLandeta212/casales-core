const express = require('express');
const accesosController = require('../controllers/accesos.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');
const { ADMINS } = require('../config/permisos');

const router = express.Router();

router.use(authenticateToken, authorizeRoles(ADMINS, 'guardia'));

router.get('/', accesosController.list);
router.post('/', accesosController.create);
router.put('/:id/autorizar', accesosController.autorizar);
router.put('/:id/rechazar', accesosController.rechazar);
router.put('/:id/salida', accesosController.salida);

module.exports = router;
