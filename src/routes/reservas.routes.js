const express = require('express');
const reservasController = require('../controllers/reservas.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');

const router = express.Router();

router.get('/public/:token/context', reservasController.publicContext);
router.get('/public/:token', reservasController.publicPage);
router.post('/public/:token', reservasController.publicCreate);
router.get('/public-token', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto'), reservasController.generatePublicToken);

router.get('/', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto', 'condomino'), reservasController.list);
router.get('/:id', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto', 'condomino'), reservasController.getById);
router.post('/', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto', 'condomino'), reservasController.create);
router.put('/:id', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto', 'condomino'), reservasController.update);
router.delete('/:id', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto', 'condomino'), reservasController.remove);

module.exports = router;
