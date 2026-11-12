const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middlewares/auth');
const { obtenerPendientes } = require('../controllers/pendientes.controller');

// Cada usuario ve solo lo que él mismo puede atender
router.use(verificarToken);

router.get('/', obtenerPendientes);

module.exports = router;