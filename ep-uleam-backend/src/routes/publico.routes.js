const express = require('express');
const router = express.Router();
const { limitePublico } = require('../middlewares/limites');
const { verificarAutenticidad } = require('../controllers/publico.controller');

// Rutas SIN sesión: cualquier persona puede comprobar la autenticidad de un documento
router.get('/verificar/:codigo', limitePublico, verificarAutenticidad);

module.exports = router;