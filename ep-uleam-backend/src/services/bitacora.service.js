// src/services/bitacora.service.js
const Bitacora = require('../models/Bitacora');
const { HASH_GENESIS, hashEntrada } = require('../utils/hash.service');

// Convierte los datos del usuario (payload del JWT) al formato que guarda la bitácora
const normalizarUsuario = (usuario) => ({
    id: usuario?.id ? String(usuario.id) : '',
    nombre: usuario?.nombreCompleto || usuario?.nombre || 'Sistema',
    rol: usuario?.rol || 'Sistema'
});

const guardarEntrada = async ({ accion, documento = null, codigoTramite = '', usuario, detalle = '' }) => {
    const ultima = await Bitacora.findOne().sort({ _id: -1 }).lean();
    const hashAnterior = ultima ? ultima.hashActual : HASH_GENESIS;

    const datos = {
        fecha: new Date(),
        accion,
        documento,
        codigoTramite: codigoTramite || '',
        usuario: normalizarUsuario(usuario),
        detalle: detalle || ''
    };

    const hashActual = hashEntrada(datos, hashAnterior);
    return Bitacora.create({ ...datos, hashAnterior, hashActual });
};

// Cola: las entradas se guardan de una en una para mantener el orden de la cadena
let cola = Promise.resolve();

const registrarAccion = (datos) => {
    const tarea = cola.then(() => guardarEntrada(datos));
    cola = tarea.catch(() => {});
    return tarea;
};

// Recalcula toda la cadena de la bitácora y detecta entradas modificadas o eliminadas
const verificarCadenaBitacora = async () => {
    const entradas = await Bitacora.find().sort({ _id: 1 }).lean();
    const errores = [];
    let hashPrevio = HASH_GENESIS;

    entradas.forEach((entrada, i) => {
        const numero = i + 1;

        if (entrada.hashAnterior !== hashPrevio) {
            errores.push(`Entrada #${numero} (${entrada.accion}): se rompió el enlace con la entrada anterior.`);
        }
        if (hashEntrada(entrada, entrada.hashAnterior) !== entrada.hashActual) {
            errores.push(`Entrada #${numero} (${entrada.accion}): su contenido fue modificado.`);
        }
        hashPrevio = entrada.hashActual;
    });

    return { integra: errores.length === 0, totalEntradas: entradas.length, errores };
};

module.exports = { registrarAccion, verificarCadenaBitacora };