const express = require('express');
const router = express.Router();
const { verificarToken, verificarRol } = require('../middlewares/auth');
const { ROLES_CONTROL } = require('../config/roles');
const { listarBitacora, ejecutarAuditoria } = require('../controllers/bitacora.controller');

// Solo los roles de control ven la bitácora y ejecutan auditorías
router.use(verificarToken, verificarRol(ROLES_CONTROL));

router.get('/', listarBitacora);
router.post('/auditoria', ejecutarAuditoria);

module.exports = router;