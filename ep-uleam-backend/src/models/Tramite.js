const mongoose = require('mongoose');

const personaSchema = new mongoose.Schema({
    id: { type: String, default: '' },
    nombre: { type: String, default: '' },
    departamento: { type: String, default: '' }
}, { _id: false });

const tramiteSchema = new mongoose.Schema({
    documento: { type: mongoose.Schema.Types.ObjectId, ref: 'Documento', required: true },
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true }, // dueño de la bandeja

    // para = destinatario principal · copia = con copia · informado = enviado solo para conocimiento
    tipo: { type: String, enum: ['para', 'copia', 'informado'], required: true },
    estado: {
        type: String,
        enum: ['pendiente', 'leido', 'respondido', 'archivado', 'reasignado'],
        default: 'pendiente'
    },

    de: { type: personaSchema, default: () => ({}) }, // quien lo envió, reasignó o informó
    comentario: { type: String, default: '' },
    fechaLimite: { type: Date, default: null },
    fechaLectura: { type: Date, default: null },

    comentarioArchivo: { type: String, default: '' },
    fechaArchivo: { type: Date, default: null },

    reasignadoA: { type: [String], default: [] },
    origen: { type: mongoose.Schema.Types.ObjectId, ref: 'Tramite', default: null } // si nació de una reasignación
}, {
    timestamps: true,
    versionKey: false
});

tramiteSchema.index({ usuario: 1, estado: 1, createdAt: -1 });
tramiteSchema.index({ documento: 1 });

module.exports = mongoose.model('Tramite', tramiteSchema);