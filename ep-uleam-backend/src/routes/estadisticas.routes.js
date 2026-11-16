const express = require('express');
const router = express.Router();
const { verificarToken, requierePermiso } = require('../middlewares/auth');
const { obtenerEstadisticas } = require('../controllers/estadisticas.controller');

router.use(verificarToken);

router.get('/', requierePermiso('documentos.consultar'), obtenerEstadisticas);

module.exports = router;