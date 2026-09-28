const express = require('express');
const authController = require('../controllers/auth.controller');
const { authenticateToken } = require('../middlewares/auth');
const { credentialsLimiter } = require('../middlewares/rateLimits');

const router = express.Router();

router.post('/login', credentialsLimiter, authController.login);
router.get('/me', authenticateToken, authController.me);
router.post('/refresh', authenticateToken, authController.refresh);
router.post('/change-password', credentialsLimiter, authenticateToken, authController.changePassword);

module.exports = router;
