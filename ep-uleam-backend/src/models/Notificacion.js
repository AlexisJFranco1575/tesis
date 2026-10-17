const mongoose = require('mongoose');

const notificacionSchema = new mongoose.Schema({
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true }, // destinatario
    tipo: { type: String, enum: ['FLUJO', 'ALERTA', 'INFO'], default: 'INFO' },
    titulo: { type: String, required: true },
    mensaje: { type: String, default: '' },
    documento: { type: mongoose.Schema.Types.ObjectId, ref: 'Documento', default: null },
    codigoTramite: { type: String, default: '' },
    leida: { type: Boolean, default: false },
    fechaLectura: { type: Date, default: null }
}, {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false
});

notificacionSchema.index({ usuario: 1, leida: 1, createdAt: -1 });

module.exports = mongoose.model('Notificacion', notificacionSchema);