const express = require('express');
const router = express.Router();
const upload = require('../middlewares/upload.middleware');
const { verificarToken, requierePermiso } = require('../middlewares/auth');
const {
    crearDocumento,
    obtenerDocumentos,
    obtenerDocumento,
    modificarDocumento,
    cambiarEstado,
    listarVersiones,
    crearVersion,
    descargarVersion,
    verificarIntegridad,
    desbloquearDocumento
} = require('../controllers/documento.controller');

// Todas las rutas de documentos requieren sesión iniciada
router.use(verificarToken);

router.post('/', requierePermiso('documentos.registrar'), upload.single('archivo'), crearDocumento);
router.get('/', requierePermiso('documentos.consultar'), obtenerDocumentos);
router.get('/:id', requierePermiso('documentos.consultar'), obtenerDocumento);
router.patch('/:id', requierePermiso('documentos.modificar'), modificarDocumento);

// Flujo documental: el controlador comprueba el permiso exacto de cada cambio de estado
router.post('/:id/estado', requierePermiso('documentos.estado', 'documentos.aprobar'), cambiarEstado);

// Versiones
router.get('/:id/versiones', requierePermiso('documentos.consultar'), listarVersiones);
router.post('/:id/versiones', requierePermiso('documentos.versionar'), upload.single('archivo'), crearVersion);
router.get('/:id/versiones/:numero/archivo', requierePermiso('documentos.descargar'), descargarVersion);

// Integridad
router.post('/:id/verificar', requierePermiso('integridad.verificar'), verificarIntegridad);
router.post('/:id/desbloquear', requierePermiso('integridad.desbloquear'), desbloquearDocumento);

module.exports = router;