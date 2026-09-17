// src/models/Documento.js
const mongoose = require('mongoose');

const documentoSchema = new mongoose.Schema({
    codigoTramite: { type: String, required: true, unique: true }, // Ej: EP-ULEAM-2026-001
    tipoDocumento: { 
        type: String, 
        enum: ['Oficio', 'Memorando', 'Resolución', 'Informe Técnico', 'Contrato'], 
        required: true 
    },
    asunto: { type: String, required: true },
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
    urlArchivo: { type: String, default: '' }, // Ruta al PDF o archivo en el servidor
    
    //(Trazabilidad Criptográfica) ---
    hashAnterior: { type: String, required: true }, // Eslabón anterior
    hashActual: { type: String, required: true },   // Firma única de este documento
    
    fechaCreacion: { type: Date, default: Date.now }
}, {
    timestamps: true, // Crea el createdAt y updatedAt automáticamente
    versionKey: false
});

module.exports = mongoose.model('Documento', documentoSchema);