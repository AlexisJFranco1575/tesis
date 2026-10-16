const { permisosEfectivos } = require('../config/roles');

// Datos del usuario que viajan al frontend y a la bitácora (nunca incluye la contraseña)
const armarSesion = (usuario) => ({
    id: String(usuario._id),
    nombreCompleto: `${usuario.nombres} ${usuario.apellidos}`,
    email: usuario.email,
    departamento: usuario.departamento,
    roles: [...usuario.roles],
    rol: usuario.roles.join(', '),
    permisos: permisosEfectivos(usuario),
    debeCambiarPassword: !!usuario.debeCambiarPassword
});

module.exports = { armarSesion };