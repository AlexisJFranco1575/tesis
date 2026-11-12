const express = require('express');
const router = express.Router();
const { verificarToken, requierePermiso } = require('../middlewares/auth');
const {
    listar,
    resumen,
    detalleDeDocumento,
    leer,
    reasignar,
    informar,
    archivar,
    restaurar
} = require('../controllers/tramite.controller');

// Cada usuario trabaja solo con las bandejas y trámites que le pertenecen
router.use(verificarToken);

router.get('/resumen', resumen);
router.get('/documento/:id', detalleDeDocumento);
router.get('/', listar);

router.post('/:id/leer', leer);
router.post('/:id/archivar', archivar);
router.post('/:id/restaurar', restaurar);

// Reasignar e informar requieren el permiso de enviar documentos
router.post('/:id/reasignar', requierePermiso('documentos.enviar'), reasignar);
router.post('/:id/informar', requierePermiso('documentos.enviar'), informar);

module.exports = router;