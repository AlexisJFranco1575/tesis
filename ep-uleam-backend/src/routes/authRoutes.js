// src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const { verificarSesion } = require('../middlewares/auth');
const { limiteLogin, limiteRecuperacion, limiteRegistroInicial } = require('../middlewares/limites');
const {
    login,
    solicitarRecuperacion,
    cambiarPassword,
    cerrarSesion,
    perfil,
    registrarAdminInicial
} = require('../controllers/auth.controller');

// Públicas (con límite de peticiones por IP)
router.post('/login', limiteLogin, login);
router.post('/recuperar', limiteRecuperacion, solicitarRecuperacion);
router.post('/registrar-admin-inicial', limiteRegistroInicial, registrarAdminInicial);

// Requieren sesión (permiten pasar a quien debe cambiar su contraseña temporal)
router.post('/logout', verificarSesion, cerrarSesion);
router.post('/cambiar-password', verificarSesion, cambiarPassword);
router.get('/yo', verificarSesion, perfil);

module.exports = router;