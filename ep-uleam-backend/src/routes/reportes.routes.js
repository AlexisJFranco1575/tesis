const express = require('express');
const router = express.Router();
const { verificarToken, requierePermiso } = require('../middlewares/auth');
const { reporteDocumentos, reporteBitacora } = require('../controllers/reportes.controller');

router.use(verificarToken);

router.get('/documentos', requierePermiso('documentos.consultar'), reporteDocumentos);
router.get('/bitacora', requierePermiso('bitacora.consultar'), reporteBitacora);

module.exports = router;