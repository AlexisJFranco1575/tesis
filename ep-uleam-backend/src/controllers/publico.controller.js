const Documento = require('../models/Documento');
const Version = require('../models/Version');
const Anexo = require('../models/Anexo');
const { claveValida, enlaceDeVerificacion } = require('../utils/verificacion');
const { cargarDocumentoAccesible } = require('../utils/documentoAcceso');

const FORMATO_CODIGO = /^EP-ULEAM-\d{4}-\d{4,}$/;
const FORMATO_HASH = /^[a-f0-9]{64}$/;

// Mismo mensaje para "no existe" y "clave incorrecta": no se puede saber cuál de las dos fue
const NO_ENCONTRADO = {
    existe: false,
    mensaje: 'No se encontró un documento con ese código, o el enlace de verificación no es válido.'
};

// GET /api/publico/verificar/:codigo?k=<clave>&hash=<sha256>   (sin sesión)
// Sin hash: informa si el documento existe y sus datos públicos.
// Con hash: además comprueba si coincide con alguna versión (o anexo) registrada.
// Los documentos confidenciales no muestran ningún dato: solo si el archivo coincide.
const verificarAutenticidad = async (req, res) => {
    try {
        const codigo = String(req.params.codigo || '').trim().toUpperCase();
        if (!FORMATO_CODIGO.test(codigo)) {
            return res.status(400).json({ existe: false, mensaje: 'El código del documento no tiene un formato válido.' });
        }

        const hash = String(req.query.hash || '').trim().toLowerCase();
        if (hash && !FORMATO_HASH.test(hash)) {
            return res.status(400).json({ existe: false, mensaje: 'El hash indicado no es un SHA-256 válido.' });
        }

        if (!claveValida(codigo, req.query.k)) {
            return res.status(404).json(NO_ENCONTRADO);
        }

        const documento = await Documento.findOne({ codigoTramite: codigo })
            .select('codigoTramite tipoDocumento numeroOficio fechaOficio createdAt remitente.departamento estado versionActual enviadoEn confidencial')
            .lean();
        if (!documento) {
            return res.status(404).json(NO_ENCONTRADO);
        }

        const respuesta = { existe: true, confidencial: !!documento.confidencial };

        if (!documento.confidencial) {
            respuesta.documento = {
                codigoTramite: documento.codigoTramite,
                tipoDocumento: documento.tipoDocumento,
                numeroOficio: documento.numeroOficio || null,
                fecha: documento.fechaOficio || documento.createdAt,
                emisor: documento.remitente?.departamento || '',
                estado: documento.estado,
                versionActual: documento.versionActual,
                enviadoEn: documento.enviadoEn || null
            };
        }

        if (hash) {
            const [version, anexo] = await Promise.all([
                Version.findOne({ documento: documento._id, hashArchivo: hash }).select('numero').lean(),
                Anexo.findOne({ documento: documento._id, hashArchivo: hash }).select('nombreOriginal').lean()
            ]);

            const tipo = version ? 'version' : anexo ? 'anexo' : null;
            respuesta.comprobacion = {
                coincide: tipo !== null,
                tipo,
                // Los detalles solo se muestran si el documento no es confidencial
                version: !documento.confidencial && version ? version.numero : null,
                esVersionActual: !documento.confidencial && version ? version.numero === documento.versionActual : null,
                anexo: !documento.confidencial && anexo ? anexo.nombreOriginal : null
            };
        }

        res.json(respuesta);
    } catch (error) {
        console.error('Error en la verificación pública:', error);
        res.status(500).json({ existe: false, mensaje: 'Error interno del servidor.' });
    }
};

// GET /api/documentos/:id/enlace-verificacion   (con sesión)
// El enlace que lleva el código QR, para compartirlo (también de los documentos cargados como archivo)
const enlaceVerificacion = async (req, res) => {
    try {
        const documento = await cargarDocumentoAccesible(req, res);
        if (!documento) return;

        res.json({ codigo: documento.codigoTramite, url: enlaceDeVerificacion(documento.codigoTramite) });
    } catch (error) {
        console.error('Error al obtener el enlace de verificación:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
};

module.exports = { verificarAutenticidad, enlaceVerificacion };