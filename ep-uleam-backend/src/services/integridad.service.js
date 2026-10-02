const fs = require('fs');
const Version = require('../models/Version');
const { hashArchivo } = require('../utils/hash.service');
const { registrarAccion } = require('./bitacora.service');

// Compara el hash guardado de cada versión con el hash recalculado de su archivo
const verificarVersiones = async (versiones) => {
    const resultados = [];

    for (const version of versiones) {
        const archivoExiste = fs.existsSync(version.rutaArchivo);
        const hashCalculado = archivoExiste ? await hashArchivo(version.rutaArchivo) : null;

        resultados.push({
            numero: version.numero,
            hashAlmacenado: version.hashArchivo,
            hashCalculado,
            archivoExiste,
            coincide: archivoExiste && hashCalculado === version.hashArchivo
        });
    }

    return resultados;
};

// CU-21: bloquea el documento y registra el incidente en la bitácora
const gestionarAlteracion = async (documento, resultados, usuario) => {
    const afectadas = resultados.filter((r) => !r.coincide).map((r) => `v${r.numero}`).join(', ');
    const detalle = `Hash SHA-256 distinto o archivo ausente en: ${afectadas}`;

    documento.bloqueado = true;
    documento.motivoBloqueo = detalle;
    await documento.save();

    await registrarAccion({
        accion: 'ALERTA_ALTERACION',
        documento: documento._id,
        codigoTramite: documento.codigoTramite,
        usuario,
        detalle
    });
};

// CU-20: verifica todas las versiones de un documento
const verificarDocumento = async (documento, usuario, { registrarExito = true } = {}) => {
    const versiones = await Version.find({ documento: documento._id }).sort({ numero: 1 });

    // A2: sin hash almacenado no se puede verificar
    if (versiones.length === 0) {
        return { valido: false, sinHash: true, versiones: [] };
    }

    const resultados = await verificarVersiones(versiones);
    const valido = resultados.every((r) => r.coincide);

    if (!valido) {
        await gestionarAlteracion(documento, resultados, usuario);
    } else if (registrarExito) {
        await registrarAccion({
            accion: 'VERIFICACION_INTEGRIDAD',
            documento: documento._id,
            codigoTramite: documento.codigoTramite,
            usuario,
            detalle: `${resultados.length} versión(es) verificada(s): íntegras`
        });
    }

    return { valido, sinHash: false, versiones: resultados };
};

module.exports = { verificarVersiones, gestionarAlteracion, verificarDocumento };