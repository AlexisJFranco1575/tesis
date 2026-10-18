const fs = require('fs');
const Version = require('../models/Version');
const Anexo = require('../models/Anexo');
const { hashArchivo } = require('../utils/hash.service');
const { registrarAccion } = require('./bitacora.service');

// Compara el hash guardado de un archivo con el hash recalculado de su contenido
const comprobar = async (ruta, hashAlmacenado) => {
    const archivoExiste = fs.existsSync(ruta);
    const hashCalculado = archivoExiste ? await hashArchivo(ruta) : null;

    return {
        hashAlmacenado,
        hashCalculado,
        archivoExiste,
        coincide: archivoExiste && hashCalculado === hashAlmacenado
    };
};

const verificarVersiones = async (versiones) => {
    const resultados = [];
    for (const version of versiones) {
        resultados.push({ numero: version.numero, ...(await comprobar(version.rutaArchivo, version.hashArchivo)) });
    }
    return resultados;
};

const verificarAnexos = async (anexos) => {
    const resultados = [];
    for (const anexo of anexos) {
        resultados.push({
            id: String(anexo._id),
            nombre: anexo.nombreOriginal,
            ...(await comprobar(anexo.rutaArchivo, anexo.hashArchivo))
        });
    }
    return resultados;
};

// CU-21: bloquea el documento y registra el incidente en la bitácora
const gestionarAlteracion = async (documento, { versiones = [], anexos = [] }, usuario) => {
    const afectados = [
        ...versiones.filter((r) => !r.coincide).map((r) => `v${r.numero}`),
        ...anexos.filter((r) => !r.coincide).map((r) => `anexo "${r.nombre}"`)
    ].join(', ');
    const detalle = `Hash SHA-256 distinto o archivo ausente en: ${afectados}`;

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

// CU-20: verifica todas las versiones y todos los anexos de un documento
const verificarDocumento = async (documento, usuario, { registrarExito = true } = {}) => {
    const [versiones, anexos] = await Promise.all([
        Version.find({ documento: documento._id }).sort({ numero: 1 }),
        Anexo.find({ documento: documento._id }).sort({ createdAt: 1 })
    ]);

    // A2: sin hash almacenado no se puede verificar
    if (versiones.length === 0) {
        return { valido: false, sinHash: true, versiones: [], anexos: [] };
    }

    const resultadosVersiones = await verificarVersiones(versiones);
    const resultadosAnexos = await verificarAnexos(anexos);
    const valido = [...resultadosVersiones, ...resultadosAnexos].every((r) => r.coincide);

    if (!valido) {
        await gestionarAlteracion(documento, { versiones: resultadosVersiones, anexos: resultadosAnexos }, usuario);
    } else if (registrarExito) {
        await registrarAccion({
            accion: 'VERIFICACION_INTEGRIDAD',
            documento: documento._id,
            codigoTramite: documento.codigoTramite,
            usuario,
            detalle: `${resultadosVersiones.length} versión(es) y ${resultadosAnexos.length} anexo(s) verificados: íntegros`
        });
    }

    return { valido, sinHash: false, versiones: resultadosVersiones, anexos: resultadosAnexos };
};

module.exports = { verificarVersiones, verificarAnexos, gestionarAlteracion, verificarDocumento };