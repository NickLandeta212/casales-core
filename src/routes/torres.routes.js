const express = require('express');
const torresController = require('../controllers/torres.controller');

const router = express.Router();

router.get('/', torresController.list);
router.get('/:id', torresController.getById);

module.exports = router;
