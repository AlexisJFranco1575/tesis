const mongoose = require('mongoose');
const { normalizar } = require('../utils/acceso');

const areaSchema = new mongoose.Schema({
    nombre: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    claveNombre: { type: String, unique: true }, // nombre sin tildes ni mayúsculas
    siglas: { type: String, default: '', trim: true, maxlength: 12 },
    tipo: { type: String, enum: ['area', 'unidad'], default: 'area' }, // unidad = unidad de negocio
    padre: { type: mongoose.Schema.Types.ObjectId, ref: 'Area', default: null },
    activa: { type: Boolean, default: true }
}, {
    timestamps: true,
    versionKey: false
});

areaSchema.pre('validate', function () {
    this.claveNombre = normalizar(this.nombre);
});

module.exports = mongoose.model('Area', areaSchema);