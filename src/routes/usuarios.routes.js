const express = require('express');
const usuariosController = require('../controllers/usuarios.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');

const router = express.Router();

router.get('/', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto'), usuariosController.list);
router.get('/:id', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto'), usuariosController.getById);
router.post('/', authenticateToken, authorizeRoles('admin_general'), usuariosController.create);
router.put('/:id', authenticateToken, authorizeRoles('admin_general'), usuariosController.update);
router.delete('/:id', authenticateToken, authorizeRoles('admin_general'), usuariosController.remove);

module.exports = router;