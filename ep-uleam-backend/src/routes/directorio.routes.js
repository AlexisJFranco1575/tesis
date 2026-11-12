const express = require('express');
const router = express.Router();
const { verificarToken, requierePermiso } = require('../middlewares/auth');
const { listarDirectorio } = require('../controllers/directorio.controller');

router.use(verificarToken);

// Solo quien puede registrar o enviar documentos necesita elegir destinatarios
router.get('/', requierePermiso('documentos.registrar', 'documentos.enviar'), listarDirectorio);

module.exports = router;