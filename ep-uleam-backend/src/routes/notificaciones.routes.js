const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middlewares/auth');
const { listarNotificaciones, marcarLeida, marcarTodasLeidas } = require('../controllers/notificacion.controller');

// Cada usuario solo ve y gestiona sus propias notificaciones
router.use(verificarToken);

router.get('/', listarNotificaciones);
router.post('/leer-todas', marcarTodasLeidas);
router.patch('/:id/leida', marcarLeida);

module.exports = router;