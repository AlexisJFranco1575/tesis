const express = require('express');
const router = express.Router();
const upload = require('../middlewares/upload.middleware');
const { crearDocumento, obtenerDocumentos, validarCadena, limpiarBaseDeDatos } = require('../controllers/documento.controller');

router.post('/', upload.single('archivo'), crearDocumento);
router.get('/', obtenerDocumentos);
router.get('/auditoria/validar', validarCadena);

// Ruta temporal para desarrollo
router.delete('/limpiar', limpiarBaseDeDatos);

module.exports = router;