const express = require('express');
const multasController = require('../controllers/multas.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');

const router = express.Router();

router.get('/motivos', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto', 'tesorero', 'condomino'), multasController.listMotivos);
router.get('/pagos', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto', 'tesorero', 'condomino'), multasController.listPagos);
router.post('/pagos', multasController.createPago);
router.put('/pagos/:id/aprobar', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto', 'tesorero'), multasController.approvePago);
router.get('/', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto', 'tesorero', 'condomino'), multasController.list);
router.get('/:id', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto', 'tesorero', 'condomino'), multasController.getById);
router.post('/', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto', 'tesorero', 'condomino'), multasController.create);
router.put('/:id', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto', 'tesorero', 'condomino'), multasController.update);
router.delete('/:id', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto', 'tesorero', 'condomino'), multasController.remove);

module.exports = router;
