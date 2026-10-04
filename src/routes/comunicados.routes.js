const express = require('express');
const comunicadosController = require('../controllers/comunicados.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');
const { ADMINS } = require('../config/permisos');

const router = express.Router();

// Cualquier usuario con sesion los lee; solo la administracion los publica.
router.use(authenticateToken);

router.get('/', comunicadosController.list);
router.post('/', authorizeRoles(ADMINS), comunicadosController.create);
router.put('/:id', authorizeRoles(ADMINS), comunicadosController.update);
router.delete('/:id', authorizeRoles(ADMINS), comunicadosController.remove);

module.exports = router;
