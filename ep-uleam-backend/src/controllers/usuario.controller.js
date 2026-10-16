const mongoose = require('mongoose');
const Usuario = require('../models/Usuario');
const { ROLES, PERMISOS, PERMISOS_POR_ROL, permisosEfectivos } = require('../config/roles');
const { registrarAccion } = require('../services/bitacora.service');
const { validarPassword, generarClaveTemporal } = require('../utils/password.util');

// ---------- Utilidades ----------

const nombreDe = (u) => `${u.nombres} ${u.apellidos}`;
const esSuperadmin = (u) => u.roles.includes('Superadmin');
const actorEsSuperadmin = (req) => req.usuario.roles.includes('Superadmin');
const textoValido = (v) => typeof v === 'string' && v.trim() !== '';
const etiquetaDe = (u) => `${nombreDe(u)} (${u.email})`;

const presentar = (usuario) => ({ ...usuario.toJSON(), permisos: permisosEfectivos(usuario) });

const errorServidor = (res, error, contexto) => {
    console.error(`Error al ${contexto}:`, error);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
};

// Busca al usuario sobre el que se actúa; si no existe, responde 404 y devuelve null
const cargarObjetivo = async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        res.status(404).json({ mensaje: 'Usuario no encontrado.' });
        return null;
    }
    const usuario = await Usuario.findById(req.params.id);
    if (!usuario) {
        res.status(404).json({ mensaje: 'Usuario no encontrado.' });
        return null;
    }
    return usuario;
};

// Reglas comunes: no actuar sobre la propia cuenta y solo un Superadmin administra a otro Superadmin
const motivoDeRechazo = (req, objetivo) => {
    if (String(objetivo._id) === req.usuario.id) {
        return 'No puede realizar esta acción sobre su propia cuenta.';
    }
    if (esSuperadmin(objetivo) && !actorEsSuperadmin(req)) {
        return 'Solo un Superadmin puede administrar a otro Superadmin.';
    }
    return null;
};

const quedaOtroSuperadminActivo = async (objetivo) => {
    const otros = await Usuario.countDocuments({ roles: 'Superadmin', estado: true, _id: { $ne: objetivo._id } });
    return otros > 0;
};

// Nadie puede otorgar roles cuyos permisos él mismo no tiene
const rechazoPorRoles = (req, rolesNuevos, rolesPrevios = []) => {
    if (actorEsSuperadmin(req)) {
        return null;
    }
    for (const rol of rolesNuevos.filter((r) => !rolesPrevios.includes(r))) {
        if (rol === 'Superadmin') {
            return 'Solo un Superadmin puede asignar el rol Superadmin.';
        }
        const faltantes = (PERMISOS_POR_ROL[rol] || []).filter((p) => !req.usuario.permisos.includes(p));
        if (faltantes.length > 0) {
            return `No puede asignar el rol ${rol}: otorga permisos que usted no posee.`;
        }
    }
    return null;
};

const leerLista = (valor) => (Array.isArray(valor) ? [...new Set(valor)] : []);

// ---------- Catálogo y listado ----------

const obtenerCatalogo = (req, res) => {
    res.json({ roles: ROLES, permisos: PERMISOS, permisosPorRol: PERMISOS_POR_ROL });
};

const listarUsuarios = async (req, res) => {
    try {
        const usuarios = await Usuario.find().sort({ createdAt: -1 });
        res.json(usuarios.map(presentar));
    } catch (error) {
        errorServidor(res, error, 'listar usuarios');
    }
};

// ---------- CU-04: Registrar usuario ----------

const crearUsuario = async (req, res) => {
    try {
        const { cedula, nombres, apellidos, email, departamento, password } = req.body || {};
        const roles = leerLista(req.body?.roles);

        if (![cedula, nombres, apellidos, email, departamento].every(textoValido)) {
            return res.status(400).json({ mensaje: 'Complete todos los datos obligatorios.' });
        }
        if (!/^\d{10}$/.test(cedula.trim())) {
            return res.status(400).json({ mensaje: 'La cédula debe tener 10 dígitos.' });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            return res.status(400).json({ mensaje: 'El correo ingresado no es válido.' });
        }
        if (roles.length === 0) {
            return res.status(400).json({ mensaje: 'Seleccione al menos un rol.' });
        }
        if (roles.some((r) => !ROLES.includes(r))) {
            return res.status(400).json({ mensaje: 'Alguno de los roles no es válido.' });
        }
        const errorPassword = validarPassword(password);
        if (errorPassword) {
            return res.status(400).json({ mensaje: errorPassword });
        }
        const rechazo = rechazoPorRoles(req, roles);
        if (rechazo) {
            return res.status(403).json({ mensaje: rechazo });
        }

        const usuario = await Usuario.create({
            cedula: cedula.trim(),
            nombres: nombres.trim(),
            apellidos: apellidos.trim(),
            email: email.trim().toLowerCase(),
            departamento: departamento.trim(),
            password,
            roles,
            debeCambiarPassword: true // deberá cambiarla en su primer acceso
        });

        await registrarAccion({
            accion: 'USUARIO_REGISTRADO',
            usuario: req.usuario,
            detalle: `${etiquetaDe(usuario)} · Roles: ${roles.join(', ')}`
        });

        res.status(201).json({ mensaje: 'Usuario registrado. Deberá cambiar su contraseña temporal al ingresar.', usuario: presentar(usuario) });
    } catch (error) {
        if (error.code === 11000) {
            const campo = error.keyPattern?.cedula ? 'cédula' : 'correo';
            return res.status(409).json({ mensaje: `Ya existe un usuario con esa ${campo}.` });
        }
        if (error.name === 'ValidationError') {
            return res.status(400).json({ mensaje: error.message });
        }
        errorServidor(res, error, 'registrar el usuario');
    }
};

// ---------- CU-05: Dar de baja usuario ----------

const darDeBaja = async (req, res) => {
    try {
        const usuario = await cargarObjetivo(req, res);
        if (!usuario) return;

        const rechazo = motivoDeRechazo(req, usuario);
        if (rechazo) {
            return res.status(403).json({ mensaje: rechazo });
        }
        if (!usuario.estado) {
            return res.status(409).json({ mensaje: 'El usuario ya se encuentra inactivo.' });
        }
        if (esSuperadmin(usuario) && !(await quedaOtroSuperadminActivo(usuario))) {
            return res.status(409).json({ mensaje: 'No se puede dar de baja al único Superadmin activo.' });
        }

        const motivo = textoValido(req.body?.motivo) ? req.body.motivo.trim() : '';

        // Se conserva todo su historial; solo pierde el acceso
        usuario.estado = false;
        usuario.fechaBaja = new Date();
        usuario.motivoBaja = motivo;
        usuario.tokenValidoDesde = new Date();
        await usuario.save();

        await registrarAccion({
            accion: 'USUARIO_BAJA',
            usuario: req.usuario,
            detalle: `${etiquetaDe(usuario)}${motivo ? ` · Motivo: ${motivo}` : ''}`
        });

        res.json({ mensaje: 'Usuario dado de baja. Su historial se conserva.', usuario: presentar(usuario) });
    } catch (error) {
        errorServidor(res, error, 'dar de baja al usuario');
    }
};

const reactivarUsuario = async (req, res) => {
    try {
        const usuario = await cargarObjetivo(req, res);
        if (!usuario) return;

        const rechazo = motivoDeRechazo(req, usuario);
        if (rechazo) {
            return res.status(403).json({ mensaje: rechazo });
        }
        if (usuario.estado) {
            return res.status(409).json({ mensaje: 'El usuario ya se encuentra activo.' });
        }

        usuario.estado = true;
        usuario.fechaBaja = null;
        usuario.motivoBaja = '';
        await usuario.save();

        await registrarAccion({
            accion: 'USUARIO_REACTIVADO',
            usuario: req.usuario,
            detalle: etiquetaDe(usuario)
        });

        res.json({ mensaje: 'Usuario reactivado.', usuario: presentar(usuario) });
    } catch (error) {
        errorServidor(res, error, 'reactivar al usuario');
    }
};

// ---------- CU-06: Gestionar roles ----------

const cambiarRoles = async (req, res) => {
    try {
        const usuario = await cargarObjetivo(req, res);
        if (!usuario) return;

        const rechazo = motivoDeRechazo(req, usuario);
        if (rechazo) {
            return res.status(403).json({ mensaje: rechazo });
        }
        if (!usuario.estado) {
            return res.status(409).json({ mensaje: 'El usuario se encuentra inactivo.' });
        }

        const roles = leerLista(req.body?.roles);
        if (roles.length === 0) {
            return res.status(400).json({ mensaje: 'Seleccione al menos un rol.' });
        }
        if (roles.some((r) => !ROLES.includes(r))) {
            return res.status(400).json({ mensaje: 'Alguno de los roles no es válido.' });
        }

        const rechazoRoles = rechazoPorRoles(req, roles, [...usuario.roles]);
        if (rechazoRoles) {
            return res.status(403).json({ mensaje: rechazoRoles });
        }
        if (esSuperadmin(usuario) && !roles.includes('Superadmin') && !(await quedaOtroSuperadminActivo(usuario))) {
            return res.status(409).json({ mensaje: 'No se puede quitar el rol al único Superadmin activo.' });
        }

        const antes = usuario.roles.join(', ');
        usuario.roles = roles;
        await usuario.save();

        await registrarAccion({
            accion: 'ROLES_MODIFICADOS',
            usuario: req.usuario,
            detalle: `${etiquetaDe(usuario)} · ${antes} → ${roles.join(', ')}`
        });

        res.json({ mensaje: 'Roles actualizados.', usuario: presentar(usuario) });
    } catch (error) {
        errorServidor(res, error, 'actualizar los roles');
    }
};

// ---------- CU-07: Gestionar permisos ----------

const cambiarPermisos = async (req, res) => {
    try {
        const usuario = await cargarObjetivo(req, res);
        if (!usuario) return;

        const rechazo = motivoDeRechazo(req, usuario);
        if (rechazo) {
            return res.status(403).json({ mensaje: rechazo });
        }
        if (!usuario.estado) {
            return res.status(409).json({ mensaje: 'El usuario se encuentra inactivo.' });
        }

        const extra = leerLista(req.body?.permisosExtra);
        const retirados = leerLista(req.body?.permisosRetirados);
        const catalogo = Object.keys(PERMISOS);

        if ([...extra, ...retirados].some((p) => !catalogo.includes(p))) {
            return res.status(400).json({ mensaje: 'Alguno de los permisos no es válido.' });
        }
        if (extra.some((p) => retirados.includes(p))) {
            return res.status(400).json({ mensaje: 'Un permiso no puede estar agregado y retirado a la vez.' });
        }
        if (!actorEsSuperadmin(req) && extra.some((p) => !req.usuario.permisos.includes(p))) {
            return res.status(403).json({ mensaje: 'No puede otorgar permisos que usted no posee.' });
        }

        usuario.permisosExtra = extra;
        usuario.permisosRetirados = retirados;
        await usuario.save();

        await registrarAccion({
            accion: 'PERMISOS_MODIFICADOS',
            usuario: req.usuario,
            detalle: `${etiquetaDe(usuario)} · Agregados: ${extra.join(', ') || 'ninguno'} · Retirados: ${retirados.join(', ') || 'ninguno'}`
        });

        res.json({ mensaje: 'Permisos actualizados.', usuario: presentar(usuario) });
    } catch (error) {
        errorServidor(res, error, 'actualizar los permisos');
    }
};

// ---------- CU-01 (flujo alterno) y CU-02: clave temporal ----------
// Sirve para recuperar una contraseña y para desbloquear una cuenta bloqueada.

const generarClave = async (req, res) => {
    try {
        const usuario = await cargarObjetivo(req, res);
        if (!usuario) return;

        const rechazo = motivoDeRechazo(req, usuario);
        if (rechazo) {
            return res.status(403).json({ mensaje: rechazo });
        }
        if (!usuario.estado) {
            return res.status(409).json({ mensaje: 'El usuario se encuentra inactivo. Reactívelo antes de generar una clave.' });
        }

        const clave = generarClaveTemporal();
        const estabaBloqueado = usuario.bloqueado;

        usuario.password = clave;
        usuario.debeCambiarPassword = true;
        usuario.intentosFallidos = 0;
        usuario.bloqueado = false;
        usuario.bloqueadoEn = null;
        usuario.solicitoRecuperacion = false;
        usuario.solicitudRecuperacionEn = null;
        usuario.tokenValidoDesde = new Date();
        await usuario.save();

        // La clave NO se guarda en la bitácora
        await registrarAccion({
            accion: 'CLAVE_TEMPORAL',
            usuario: req.usuario,
            detalle: `${etiquetaDe(usuario)}${estabaBloqueado ? ' · cuenta desbloqueada' : ''}`
        });

        res.json({
            mensaje: 'Clave temporal generada. Entréguesela al usuario: solo se muestra esta vez.',
            claveTemporal: clave,
            usuario: presentar(usuario)
        });
    } catch (error) {
        errorServidor(res, error, 'generar la clave temporal');
    }
};

module.exports = {
    obtenerCatalogo,
    listarUsuarios,
    crearUsuario,
    darDeBaja,
    reactivarUsuario,
    cambiarRoles,
    cambiarPermisos,
    generarClave
};