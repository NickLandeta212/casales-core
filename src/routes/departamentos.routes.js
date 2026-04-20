const express = require('express');
const departamentosController = require('../controllers/departamentos.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');

const router = express.Router();

router.get('/', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto', 'condomino'), departamentosController.list);
router.get('/:id', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto', 'condomino'), departamentosController.getById);
router.delete('/:id', authenticateToken, authorizeRoles('admin_general'), departamentosController.remove);

module.exports = router;
