const express = require('express');
const personasController = require('../controllers/personas.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');

const router = express.Router();

router.get('/', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto', 'condomino'), personasController.list);
router.get('/:id', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto', 'condomino'), personasController.getById);
router.post('/', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto', 'condomino'), personasController.create);
router.put('/:id', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto', 'condomino'), personasController.update);
router.delete('/:id', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto', 'condomino'), personasController.remove);

module.exports = router;
