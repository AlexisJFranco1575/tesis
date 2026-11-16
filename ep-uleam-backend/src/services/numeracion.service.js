// Número automático de documento: <SIGLAS DEL ÁREA>-<AÑO>-<CONSECUTIVO>-<TIPO>, ej. SG-2026-0001-MEM.
// El consecutivo es independiente para cada área, tipo y año.
const Contador = require('../models/Contador');
const Documento = require('../models/Documento');
const { SIGLAS_TIPO } = require('../config/clasificacion');
const { resolverArea } = require('./catalogo.service');
const { normalizar } = require('../utils/acceso');

const PALABRAS_VACIAS = ['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'en'];

// Si el área no tiene siglas en el catálogo, se arman con las iniciales de su nombre
const siglasDeNombre = (nombre) =>
    normalizar(nombre)
        .split(' ')
        .filter((p) => p && !PALABRAS_VACIAS.includes(p))
        .map((p) => p[0])
        .join('')
        .toUpperCase()
        .slice(0, 6);

const limpiarSiglas = (texto) => String(texto || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const siglasDeArea = async (nombreArea) => {
    const area = await resolverArea(nombreArea);
    return limpiarSiglas(area?.siglas) || limpiarSiglas(siglasDeNombre(nombreArea)) || 'GEN';
};

const generarNumeroDocumento = async ({ tipoDocumento, areaNombre, fecha }) => {
    const siglas = await siglasDeArea(areaNombre);
    const tipo = SIGLAS_TIPO[tipoDocumento] || 'DOC';
    const anio = (fecha ? new Date(fecha) : new Date()).getUTCFullYear();

    // Si alguien ya escribió a mano un número igual, se salta al siguiente consecutivo
    for (let intento = 0; intento < 10; intento += 1) {
        const contador = await Contador.findOneAndUpdate(
            { _id: `numero-${siglas}-${tipo}-${anio}` },
            { $inc: { valor: 1 } },
            { upsert: true, returnDocument: 'after' }
        );
        const numero = `${siglas}-${anio}-${String(contador.valor).padStart(4, '0')}-${tipo}`;
        if (!(await Documento.exists({ numeroOficio: numero }))) {
            return numero;
        }
    }
    throw new Error('No se pudo generar un número de documento único.');
};

module.exports = { generarNumeroDocumento, siglasDeArea };