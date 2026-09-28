const express = require('express');
const personasController = require('../controllers/personas.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');
const { GESTION } = require('../config/permisos');

const router = express.Router();

const gestion = authorizeRoles(GESTION);
// La guardia consulta residentes para contactar al propietario cuando llega una visita.
const lectura = authorizeRoles(GESTION, 'guardia');

router.get('/', authenticateToken, lectura, personasController.list);
router.get('/:id', authenticateToken, lectura, personasController.getById);
router.post('/', authenticateToken, gestion, personasController.create);
router.put('/:id', authenticateToken, gestion, personasController.update);
router.put('/:id/movilidad', authenticateToken, gestion, personasController.updateMovilidad);
router.delete('/:id', authenticateToken, gestion, personasController.remove);

module.exports = router;
