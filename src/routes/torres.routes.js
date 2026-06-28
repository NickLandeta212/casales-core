const express = require('express');
const torresController = require('../controllers/torres.controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');

const router = express.Router();

router.get('/', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto', 'tesorero'), torresController.list);
router.get('/:id', authenticateToken, authorizeRoles('admin_general', 'admin_conjunto', 'tesorero'), torresController.getById);

module.exports = router;
