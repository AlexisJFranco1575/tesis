// src/models/Version.js
const mongoose = require('mongoose');

const versionSchema = new mongoose.Schema({
    documento: { type: mongoose.Schema.Types.ObjectId, ref: 'Documento', required: true },
    numero: { type: Number, required: true },
    nombreOriginal: { type: String, required: true },
    rutaArchivo: { type: String, required: true },   // Ruta interna del servidor (no se expone al frontend)
    tamanoBytes: { type: Number, default: 0 },
    hashArchivo: { type: String, required: true },   // SHA-256 del archivo (RF-15)
    comentario: { type: String, default: '' },       // Motivo del cambio
    creadoPor: {
        id: { type: String, default: '' },
        nombre: { type: String, default: '' }
    }
}, {
    timestamps: true,
    versionKey: false
});

// No pueden existir dos versiones con el mismo número en un documento
versionSchema.index({ documento: 1, numero: 1 }, { unique: true });

module.exports = mongoose.model('Version', versionSchema);