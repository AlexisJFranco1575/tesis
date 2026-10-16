const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLES } = require('../config/roles');

const usuarioSchema = new mongoose.Schema({
    cedula: { type: String, required: true, unique: true, trim: true },
    nombres: { type: String, required: true, trim: true },
    apellidos: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    departamento: { type: String, required: true, trim: true },

    // Uno o más roles (RF-04) y ajustes de permisos por usuario (RF-05)
    roles: {
        type: [{ type: String, enum: ROLES }],
        validate: {
            validator: (valor) => Array.isArray(valor) && valor.length > 0,
            message: 'El usuario debe tener al menos un rol.'
        }
    },
    permisosExtra: { type: [String], default: [] },
    permisosRetirados: { type: [String], default: [] },

    // Estado de la cuenta: false = dada de baja (se conserva su historial)
    estado: { type: Boolean, default: true },
    fechaBaja: { type: Date, default: null },
    motivoBaja: { type: String, default: '' },

    // Control de acceso (RF-01)
    intentosFallidos: { type: Number, default: 0 },
    bloqueado: { type: Boolean, default: false },
    bloqueadoEn: { type: Date, default: null },
    debeCambiarPassword: { type: Boolean, default: false },
    solicitoRecuperacion: { type: Boolean, default: false },
    solicitudRecuperacionEn: { type: Date, default: null },

    // Sesión (RF-02)
    ultimoAcceso: { type: Date, default: null },
    ultimaActividad: { type: Date, default: null },
    tokenValidoDesde: { type: Date, default: null } // las sesiones anteriores a esta fecha dejan de valer
}, {
    timestamps: true,
    versionKey: false
});

// La contraseña nunca sale en las respuestas de la API
usuarioSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret.password;
        delete ret.tokenValidoDesde;
        delete ret.ultimaActividad;
        return ret;
    }
});

// Encriptación automática al guardar una contraseña nueva o modificada
usuarioSchema.pre('save', async function () {
    if (!this.isModified('password')) {
        return;
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

usuarioSchema.methods.compararPassword = async function (passwordIngresado) {
    return bcrypt.compare(passwordIngresado, this.password);
};

module.exports = mongoose.model('Usuario', usuarioSchema);