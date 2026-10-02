// src/models/Bitacora.js
const mongoose = require('mongoose');

const ACCIONES = [
    'REGISTRO_DOCUMENTO',
    'NUEVA_VERSION',
    'CONSULTA_DOCUMENTO',
    'DESCARGA_DOCUMENTO',
    'VERIFICACION_INTEGRIDAD',
    'ALERTA_ALTERACION',
    'DESBLOQUEO',
    'AUDITORIA_GENERAL'
];

const bitacoraSchema = new mongoose.Schema({
    fecha: { type: Date, required: true },
    accion: { type: String, enum: ACCIONES, required: true },
    documento: { type: mongoose.Schema.Types.ObjectId, ref: 'Documento', default: null },
    codigoTramite: { type: String, default: '' },
    usuario: {
        id: { type: String, default: '' },
        nombre: { type: String, required: true },
        rol: { type: String, required: true }
    },
    detalle: { type: String, default: '' },

    // Cadena de hashes de la bitácora
    hashAnterior: { type: String, required: true },
    hashActual: { type: String, required: true }
}, {
    versionKey: false
});

// La bitácora es de solo lectura: solo se agregan entradas nuevas
const operacionesProhibidas = [
    'updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace',
    'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete'
];

bitacoraSchema.pre(operacionesProhibidas, function () {
    throw new Error('La bitácora es de solo lectura: no se puede modificar ni eliminar.');
});

bitacoraSchema.pre('save', function () {
    if (!this.isNew) {
        throw new Error('La bitácora es de solo lectura: no se puede modificar una entrada existente.');
    }
});

module.exports = mongoose.model('Bitacora', bitacoraSchema);