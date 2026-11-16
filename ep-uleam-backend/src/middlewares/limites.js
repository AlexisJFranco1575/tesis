const { rateLimit } = require('express-rate-limit');

// Los límites se omiten en las pruebas automáticas y, solo en entornos de prueba,
// cuando se define DESACTIVAR_LIMITES=1 (para medir el rendimiento sin que se active el límite)
const omitir = () => process.env.NODE_ENV === 'test' || process.env.DESACTIVAR_LIMITES === '1';

const crearLimite = ({ ventanaMinutos, maximo, mensaje }) =>
    rateLimit({
        windowMs: ventanaMinutos * 60 * 1000,
        limit: maximo,
        standardHeaders: true,
        legacyHeaders: false,
        skip: omitir,
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

// La verificación pública de autenticidad no requiere sesión: se limita por IP
const limitePublico = crearLimite({
    ventanaMinutos: 15,
    maximo: 60,
    mensaje: 'Demasiadas consultas de verificación desde esta dirección. Intente más tarde.'
});

module.exports = { limiteGeneral, limiteLogin, limiteRecuperacion, limiteRegistroInicial, limitePublico };