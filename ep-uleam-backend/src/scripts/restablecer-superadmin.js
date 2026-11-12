// Restablece de emergencia la cuenta de un Superadmin: la desbloquea, la reactiva
// y le asigna una clave temporal (deberá cambiarla al ingresar).
//
// Uso (dentro del contenedor de la API):
//   node src/scripts/restablecer-superadmin.js <correo> <nuevaClave> <llaveDeInstalacion>
require('dotenv').config();
const crypto = require('crypto');
const mongoose = require('mongoose');
const Usuario = require('../models/Usuario');
const { registrarAccion } = require('../services/bitacora.service');
const { validarPassword } = require('../utils/password.util');

const [correo, clave, llave] = process.argv.slice(2);

const salir = (mensaje) => {
    console.error(mensaje);
    process.exit(1);
};

const llaveValida = () => {
    const esperada = process.env.SETUP_KEY || '';
    const a = Buffer.from(llave || '');
    const b = Buffer.from(esperada);
    return esperada !== '' && a.length === b.length && crypto.timingSafeEqual(a, b);
};

(async () => {
    if (!correo || !clave || !llave) {
        salir('Uso: node src/scripts/restablecer-superadmin.js <correo> <nuevaClave> <llaveDeInstalacion>');
    }
    if (!process.env.MONGODB_URI || !process.env.SETUP_KEY) {
        salir('Faltan MONGODB_URI o SETUP_KEY en el entorno del servidor.');
    }
    if (!llaveValida()) {
        salir('Llave de instalación incorrecta.');
    }
    const errorClave = validarPassword(clave);
    if (errorClave) {
        salir(errorClave);
    }

    await mongoose.connect(process.env.MONGODB_URI);

    const usuario = await Usuario.findOne({ email: correo.trim().toLowerCase() });
    if (!usuario) {
        salir('No existe un usuario con ese correo.');
    }
    if (!usuario.roles.includes('Superadmin')) {
        salir('Este script solo restablece cuentas con el rol Superadmin.');
    }

    usuario.password = clave;
    usuario.estado = true;
    usuario.fechaBaja = null;
    usuario.motivoBaja = '';
    usuario.bloqueado = false;
    usuario.bloqueadoEn = null;
    usuario.intentosFallidos = 0;
    usuario.solicitoRecuperacion = false;
    usuario.solicitudRecuperacionEn = null;
    usuario.debeCambiarPassword = true;
    usuario.tokenValidoDesde = new Date();
    await usuario.save();

    await registrarAccion({
        accion: 'CLAVE_TEMPORAL',
        usuario: { nombre: 'Sistema (consola del servidor)', rol: 'Sistema' },
        detalle: `Restablecimiento de emergencia del Superadmin ${usuario.email}`
    });

    console.log(`Cuenta ${usuario.email} restablecida. Debe ingresar con la clave indicada y cambiarla.`);
    await mongoose.disconnect();
})().catch((error) => {
    console.error('Error:', error.message);
    process.exit(1);
});