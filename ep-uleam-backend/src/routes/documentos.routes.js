const express = require('express');
const router = express.Router();
const { crearDocumento, obtenerDocumentos } = require('../controllers/documento.controller');

router.post('/', crearDocumento);
router.get('/', obtenerDocumentos);

module.exports = router;