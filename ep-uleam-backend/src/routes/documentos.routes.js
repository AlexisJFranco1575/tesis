const express = require('express');
const router = express.Router();
const upload = require('../middlewares/upload.middleware');
const { verificarToken, verificarRol } = require('../middlewares/auth');
const { ROLES_CONTROL } = require('../config/roles');
const {
    crearDocumento,
    obtenerDocumentos,
    obtenerDocumento,
    listarVersiones,
    crearVersion,
    descargarVersion,
    verificarIntegridad,
    desbloquearDocumento
} = require('../controllers/documento.controller');

// Todas las rutas de documentos requieren sesión iniciada
router.use(verificarToken);

router.post('/', upload.single('archivo'), crearDocumento);
router.get('/', obtenerDocumentos);
router.get('/:id', obtenerDocumento);

// Versiones
router.get('/:id/versiones', listarVersiones);
router.post('/:id/versiones', upload.single('archivo'), crearVersion);
router.get('/:id/versiones/:numero/archivo', descargarVersion);

// Integridad (solo roles de control)
router.post('/:id/verificar', verificarRol(ROLES_CONTROL), verificarIntegridad);
router.post('/:id/desbloquear', verificarRol(ROLES_CONTROL), desbloquearDocumento);

module.exports = router;