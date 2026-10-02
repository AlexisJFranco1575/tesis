// src/models/Documento.js
const mongoose = require('mongoose');

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
    estado: {
        type: String,
        enum: ['Generado', 'En Revisión', 'Aprobado', 'Archivado'],
        default: 'Generado'
    },

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