const express = require('express');
const multasController = require('../controllers/multas.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');

const router = express.Router();

const lectura = authorizeRoles('admin_general', 'admin_conjunto', 'tesorero', 'condomino');
const gestion = authorizeRoles('admin_general', 'admin_conjunto', 'tesorero');
// Los pagos de multas (los envia el condomino desde /mi-cuenta) los consulta la gestion,
// pero los aprueba o rechaza solo el tesorero de la torre.
const tesoreria = authorizeRoles('tesorero');

router.get('/motivos', authenticateToken, lectura, multasController.listMotivos);
router.get('/pagos', authenticateToken, gestion, multasController.listPagos);
router.put('/pagos/:id/aprobar', authenticateToken, tesoreria, multasController.approvePago);
router.put('/pagos/:id/rechazar', authenticateToken, tesoreria, multasController.rejectPago);
router.get('/', authenticateToken, lectura, multasController.list);
router.get('/:id', authenticateToken, lectura, multasController.getById);
router.post('/', authenticateToken, gestion, multasController.create);
router.put('/:id', authenticateToken, gestion, multasController.update);
router.delete('/:id', authenticateToken, gestion, multasController.remove);

module.exports = router;
