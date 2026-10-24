const express = require('express');
const egresosController = require('../controllers/egresos.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');
const { GESTION } = require('../config/permisos');

const router = express.Router();

// Administracion (egresos del conjunto) y tesoreria (egresos de sus torres).
router.use(authenticateToken, authorizeRoles(GESTION));

router.get('/catalogos', egresosController.catalogos);

router.get('/proveedores', egresosController.listProveedores);
router.post('/proveedores', egresosController.createProveedor);
router.put('/proveedores/:id', egresosController.updateProveedor);

router.get('/', egresosController.list);
router.post('/', egresosController.create);
router.put('/:id/pagar', egresosController.pagar);
router.put('/:id/anular', egresosController.anular);

module.exports = router;
