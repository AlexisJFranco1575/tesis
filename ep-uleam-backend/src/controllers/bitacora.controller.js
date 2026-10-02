// src/controllers/bitacora.controller.js
const mongoose = require('mongoose');
const Bitacora = require('../models/Bitacora');
const Documento = require('../models/Documento');
const { registrarAccion, verificarCadenaBitacora } = require('../services/bitacora.service');
const { verificarDocumento } = require('../services/integridad.service');

// CU-18: GET /api/bitacora?documento=<id>&limite=100
const listarBitacora = async (req, res) => {
    try {
        const limite = Math.min(Number(req.query.limite) || 100, 500);
        const filtro = {};

        if (req.query.documento) {
            if (!mongoose.isValidObjectId(req.query.documento)) {
                return res.status(400).json({ mensaje: 'Identificador de documento no válido.' });
            }
            filtro.documento = req.query.documento;
        }

        const entradas = await Bitacora.find(filtro).sort({ _id: -1 }).limit(limite).lean();
        res.json(entradas);
    } catch (error) {
        console.error('Error al consultar la bitácora:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
};

// POST /api/bitacora/auditoria
const ejecutarAuditoria = async (req, res) => {
    try {
        // 1) Primero se revisa la cadena de la bitácora, antes de que la propia auditoría agregue entradas
        const bitacora = await verificarCadenaBitacora();

        // 2) Se verifica la integridad de todas las versiones de todos los documentos
        const documentos = await Documento.find().sort({ createdAt: 1 });
        const documentosAlterados = [];
        let versionesAnalizadas = 0;

        for (const documento of documentos) {
            const resultado = await verificarDocumento(documento, req.usuario, { registrarExito: false });
            versionesAnalizadas += resultado.versiones.length;

            if (!resultado.valido && !resultado.sinHash) {
                documentosAlterados.push({
                    documentoId: documento._id,
                    codigoTramite: documento.codigoTramite,
                    versiones: resultado.versiones.filter((v) => !v.coincide)
                });
            }
        }

        const valido = bitacora.integra && documentosAlterados.length === 0;

        await registrarAccion({
            accion: 'AUDITORIA_GENERAL',
            usuario: req.usuario,
            detalle: `${documentos.length} documento(s), ${versionesAnalizadas} versión(es). ` +
                     `Alterados: ${documentosAlterados.length}. Bitácora íntegra: ${bitacora.integra ? 'sí' : 'no'}.`
        });

        res.json({
            mensaje: valido
                ? 'Auditoría exitosa: los archivos y la bitácora están íntegros.'
                : 'ALERTA CRÍTICA: se detectó alteración en la información.',
            valido,
            documentosAnalizados: documentos.length,
            versionesAnalizadas,
            documentosAlterados,
            bitacora
        });

    } catch (error) {
        console.error('Error en la auditoría general:', error);
        res.status(500).json({ mensaje: 'Error interno durante la auditoría.' });
    }
};

module.exports = { listarBitacora, ejecutarAuditoria };