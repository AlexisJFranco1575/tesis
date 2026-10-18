const mongoose = require('mongoose');
const { TIPOS_ANEXO } = require('../config/clasificacion');

const anexoSchema = new mongoose.Schema({
    documento: { type: mongoose.Schema.Types.ObjectId, ref: 'Documento', required: true },
    nombreOriginal: { type: String, required: true },
    rutaArchivo: { type: String, required: true },   // Ruta interna del servidor (no se expone al frontend)
    tamanoBytes: { type: Number, default: 0 },
    hashArchivo: { type: String, required: true },   // SHA-256 del anexo
    tipoAnexo: { type: String, enum: TIPOS_ANEXO, required: true }, // clasificación (CU-10)
    descripcion: { type: String, default: '' },
    creadoPor: {
        id: { type: String, default: '' },
        nombre: { type: String, default: '' }
    }
}, {
    timestamps: true,
    versionKey: false
});

anexoSchema.index({ documento: 1, createdAt: 1 });

module.exports = mongoose.model('Anexo', anexoSchema);