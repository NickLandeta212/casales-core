const express = require('express');
const authController = require('../controllers/auth.controller');
const { authenticateToken } = require('../middlewares/auth');

const router = express.Router();

router.post('/login', authController.login);
router.get('/me', authenticateToken, authController.me);
router.post('/refresh', authenticateToken, authController.refresh);

module.exports = router;
