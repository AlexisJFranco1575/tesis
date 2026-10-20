// src/middlewares/limites.js
const { rateLimit } = require('express-rate-limit');

const enPruebas = () => process.env.NODE_ENV === 'test';

const crearLimite = ({ ventanaMinutos, maximo, mensaje }) =>
    rateLimit({
        windowMs: ventanaMinutos * 60 * 1000,
        limit: maximo,
        standardHeaders: true,
        legacyHeaders: false,
        skip: enPruebas,
        message: { mensaje }
    });

// Límite general para toda la API
const limiteGeneral = crearLimite({
    ventanaMinutos: 15,
    maximo: 1000,
    mensaje: 'Demasiadas peticiones desde esta dirección. Intente nuevamente en unos minutos.'
});

// El bloqueo por cuenta (3 intentos) ya protege cada usuario; este límite frena el abuso por IP
const limiteLogin = crearLimite({
    ventanaMinutos: 15,
    maximo: 60,
    mensaje: 'Demasiados intentos de inicio de sesión desde esta dirección. Espere 15 minutos.'
});

const limiteRecuperacion = crearLimite({
    ventanaMinutos: 60,
    maximo: 5,
    mensaje: 'Demasiadas solicitudes de recuperación desde esta dirección. Intente más tarde.'
});

const limiteRegistroInicial = crearLimite({
    ventanaMinutos: 60,
    maximo: 10,
    mensaje: 'Demasiados intentos. Intente más tarde.'
});

module.exports = { limiteGeneral, limiteLogin, limiteRecuperacion, limiteRegistroInicial };