const mongoose = require('mongoose');
const { normalizar } = require('../utils/acceso');

const rolSchema = new mongoose.Schema({
    nombre: { type: String, required: true, trim: true, minlength: 2, maxlength: 40 },
    claveNombre: { type: String, unique: true }, // nombre sin tildes ni mayúsculas: evita duplicados "Tesorería"/"tesoreria"
    descripcion: { type: String, default: '', trim: true, maxlength: 300 },
    permisos: { type: [String], default: [] },
    protegido: { type: Boolean, default: false }, // solo un Superadmin lo asigna o lo modifica
    sistema: { type: Boolean, default: false },   // rol base: no se puede eliminar
    activo: { type: Boolean, default: true }
}, {
    timestamps: true,
    versionKey: false
});

rolSchema.pre('validate', function () {
    this.claveNombre = normalizar(this.nombre);
});

module.exports = mongoose.model('Rol', rolSchema);