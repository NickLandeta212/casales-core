const express = require('express');
const publicController = require('../controllers/public.controller');
const { publicReadLimiter } = require('../middlewares/rateLimits');

// Datos minimos que necesitan los formularios publicos (QR) sin iniciar sesion.
const router = express.Router();

router.use(publicReadLimiter);

router.get('/config', publicController.getConfig);
router.get('/torres', publicController.listTorres);
router.get('/torres/:torreId/departamentos', publicController.listDepartamentos);
router.get('/reservas/fechas-ocupadas', publicController.listFechasOcupadas);

module.exports = router;
