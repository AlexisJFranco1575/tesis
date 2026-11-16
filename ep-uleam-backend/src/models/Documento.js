const mongoose = require('mongoose');
const { ESTADOS } = require('../config/flujo');
const { TIPOS_DOCUMENTO, PRIORIDADES } = require('../config/clasificacion');

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
    // Identificador único generado por el sistema, ej: EP-ULEAM-2026-0001 (CU-08 paso 7)
    codigoTramite: { type: String, required: true, unique: true, trim: true },

    // Número del documento (se genera automáticamente por área, tipo y año; también puede escribirse a mano).
    // "sparse" permite documentos antiguos que no lo tienen.
    numeroOficio: { type: String, trim: true, uppercase: true, unique: true, sparse: true },
    fechaOficio: { type: Date },
    motivo: { type: String, default: '', trim: true },
    observacion: { type: String, default: '', trim: true },

    tipoDocumento: { type: String, enum: TIPOS_DOCUMENTO, required: true },
    asunto: { type: String, required: true, trim: true },
    remitente: {
        nombre: { type: String, required: true },
        departamento: { type: String, required: true }
    },
    // Destinatario principal. Al enviar el documento se actualiza con el primer "Para".
    destinatario: {
        nombre: { type: String, required: true },
        departamento: { type: String, required: true },
        usuario: { type: String, default: '' }
    },
    estado: { type: String, enum: ESTADOS, default: 'Generado' },

    // Contenido: 'redactado' = escrito en el sistema (el PDF se genera con el formato institucional);
    // 'cargado' = el archivo se subió ya elaborado (PDF, Word o Excel)
    origen: { type: String, enum: ['redactado', 'cargado'], default: 'cargado' },
    cuerpo: { type: String, default: '' },

    // Trámite
    prioridad: { type: String, enum: PRIORIDADES, default: 'Normal' },
    confidencial: { type: Boolean, default: false }, // solo lo ven quienes intervienen
    fechaLimite: { type: Date, default: null },      // plazo de respuesta
    referencia: { type: mongoose.Schema.Types.ObjectId, ref: 'Documento', default: null }, // documento al que responde
    involucrados: { type: [String], default: [] },   // ids de los usuarios que intervienen en el trámite
    enviadoEn: { type: Date, default: null },

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