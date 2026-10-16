const express = require('express');
const router = express.Router();
const { verificarToken, requierePermiso } = require('../middlewares/auth');
const { listarBitacora, ejecutarAuditoria } = require('../controllers/bitacora.controller');

router.use(verificarToken);

router.get('/', requierePermiso('bitacora.consultar'), listarBitacora);
router.post('/auditoria', requierePermiso('auditoria.ejecutar'), ejecutarAuditoria);

module.exports = router;