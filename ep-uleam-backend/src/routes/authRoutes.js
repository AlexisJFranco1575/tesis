const express = require('express');
const router = express.Router();
const { verificarSesion } = require('../middlewares/auth');
const {
    login,
    solicitarRecuperacion,
    cambiarPassword,
    cerrarSesion,
    perfil,
    registrarAdminInicial
} = require('../controllers/auth.controller');

// Públicas
router.post('/login', login);
router.post('/recuperar', solicitarRecuperacion);
router.post('/registrar-admin-inicial', registrarAdminInicial);

// Requieren sesión (permiten pasar a quien debe cambiar su contraseña temporal)
router.post('/logout', verificarSesion, cerrarSesion);
router.post('/cambiar-password', verificarSesion, cambiarPassword);
router.get('/yo', verificarSesion, perfil);

module.exports = router;