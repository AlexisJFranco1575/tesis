const mongoose = require('mongoose');

const TIPOS = ['ELABORACION', 'ENVIO', 'LECTURA', 'REASIGNACION', 'INFORME', 'ARCHIVO', 'RESTAURACION', 'RESPUESTA'];

const personaSchema = new mongoose.Schema({
    id: { type: String, default: '' },
    nombre: { type: String, default: '' },
    departamento: { type: String, default: '' }
}, { _id: false });

const movimientoSchema = new mongoose.Schema({
    documento: { type: mongoose.Schema.Types.ObjectId, ref: 'Documento', required: true },
    tipo: { type: String, enum: TIPOS, required: true },
    de: { type: personaSchema, default: () => ({}) },
    para: { type: [personaSchema], default: [] },
    comentario: { type: String, default: '' }
}, {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false
});

movimientoSchema.index({ documento: 1, createdAt: 1 });

module.exports = mongoose.model('Movimiento', movimientoSchema);