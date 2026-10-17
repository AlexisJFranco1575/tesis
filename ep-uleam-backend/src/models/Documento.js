const mongoose = require('mongoose');
const { ESTADOS } = require('../config/flujo');

// Decisión de Gerencia sobre una versión del documento (RF-18)
const revisionSchema = new mongoose.Schema({
    decision: { type: String, enum: ['Aprobado', 'Rechazado'], required: true },
    observacion: { type: String, default: '' },
    version: { type: Number, required: true },
    por: {
        id: { type: String, default: '' },
        nombre: { type: String, default: '' },
        rol: { type: String, default: '' }
    },
    fecha: { type: Date, default: Date.now }
}, { _id: false });

const documentoSchema = new mongoose.Schema({
    codigoTramite: { type: String, required: true, unique: true, trim: true }, // Ej: EP-ULEAM-2026-001
    tipoDocumento: {
        type: String,
        enum: ['Oficio', 'Memorando', 'Resolución', 'Informe Técnico', 'Contrato'],
        required: true
    },
    asunto: { type: String, required: true, trim: true },
    remitente: {
        nombre: { type: String, required: true },
        departamento: { type: String, required: true }
    },
    destinatario: {
        nombre: { type: String, required: true },
        departamento: { type: String, required: true }
    },
    estado: { type: String, enum: ESTADOS, default: 'Generado' },

    // Decisiones de Gerencia, de la más antigua a la más reciente
    revisiones: { type: [revisionSchema], default: [] },

    // Versión vigente y SHA-256 de su archivo
    versionActual: { type: Number, default: 1 },
    hashActual: { type: String, required: true },

    // Bloqueo por alerta de alteración (RF-17)
    bloqueado: { type: Boolean, default: false },
    motivoBloqueo: { type: String, default: '' },

    creadoPor: {
        id: { type: String, default: '' },
        nombre: { type: String, default: '' }
    }
}, {
    timestamps: true,
    versionKey: false
});

module.exports = mongoose.model('Documento', documentoSchema);