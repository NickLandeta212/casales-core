const express = require('express');
const multasController = require('../controllers/multas.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');

const router = express.Router();

router.get('/motivos', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto', 'condomino'), multasController.listMotivos);
router.get('/', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto', 'condomino'), multasController.list);
router.get('/:id', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto', 'condomino'), multasController.getById);
router.post('/', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto', 'condomino'), multasController.create);
router.put('/:id', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto', 'condomino'), multasController.update);
router.delete('/:id', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto', 'condomino'), multasController.remove);

module.exports = router;