const express = require('express');
const usuariosController = require('../controllers/usuarios.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');

const router = express.Router();

router.get('/', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto'), usuariosController.list);
router.get('/:id', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto'), usuariosController.getById);
// El admin del conjunto tambien gestiona usuarios (p. ej. asignar tesoreros), pero no administradores generales.
router.post('/', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto'), usuariosController.create);
router.put('/:id', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto'), usuariosController.update);
router.delete('/:id', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto'), usuariosController.remove);

module.exports = router;