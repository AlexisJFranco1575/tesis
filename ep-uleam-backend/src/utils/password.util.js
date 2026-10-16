// src/utils/password.util.js
const crypto = require('crypto');

// Sin caracteres que se confunden al leerlos (0/O, 1/l/I)
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

// Devuelve un mensaje de error, o null si la contraseña es válida
const validarPassword = (password) => {
    if (typeof password !== 'string' || password.length < 8) {
        return 'La contraseña debe tener al menos 8 caracteres.';
    }
    if (password.length > 72) {
        return 'La contraseña no puede superar los 72 caracteres.';
    }
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
        return 'La contraseña debe combinar letras y números.';
    }
    return null;
};

// Clave temporal aleatoria (CU-01 y CU-02)
const generarClaveTemporal = (largo = 10) => {
    let clave;
    do {
        clave = Array.from(crypto.randomBytes(largo), (b) => ALFABETO[b % ALFABETO.length]).join('');
    } while (!/[A-Za-z]/.test(clave) || !/\d/.test(clave));
    return clave;
};

module.exports = { validarPassword, generarClaveTemporal };