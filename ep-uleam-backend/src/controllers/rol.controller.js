const mongoose = require('mongoose');
const Rol = require('../models/Rol');
const Usuario = require('../models/Usuario');
const { PERMISOS, PERMISOS_SENSIBLES } = require('../config/roles');
const { registrarAccion } = require('../services/bitacora.service');
const { recargarRoles } = require('../services/catalogo.service');

const actorEsSuperadmin = (req) => req.usuario.roles.includes('Superadmin');

// El rol Superadmin no se modifica; los roles protegidos solo los modifica un Superadmin
const puedeEditar = (req, rol) => rol.nombre !== 'Superadmin' && (!rol.protegido || actorEsSuperadmin(req));

const leerLista = (valor) => (Array.isArray(valor) ? [...new Set(valor)] : []);
const permisosValidos = (lista) => lista.every((p) => Object.keys(PERMISOS).includes(p));

// Permisos sensibles de la lista que el actor no puede otorgar
const sensiblesNoOtorgables = (req, permisos) =>
    actorEsSuperadmin(req)
        ? []
        : permisos.filter((p) => PERMISOS_SENSIBLES.includes(p) && !req.usuario.permisos.includes(p));

const nombresDe = (permisos) => permisos.map((p) => PERMISOS[p]).join(', ');

const presentar = (req, rol, usuarios) => ({
    _id: rol._id,
    nombre: rol.nombre,
    descripcion: rol.descripcion,
    permisos: rol.permisos,
    protegido: rol.protegido,
    sistema: rol.sistema,
    usuarios,
    editable: puedeEditar(req, rol),
    eliminable: !rol.sistema && usuarios === 0 && puedeEditar(req, rol)
});

const cargarRol = async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        res.status(404).json({ mensaje: 'Rol no encontrado.' });
        return null;
    }
    const rol = await Rol.findById(req.params.id);
    if (!rol) {
        res.status(404).json({ mensaje: 'Rol no encontrado.' });
        return null;
    }
    return rol;
};

const errorServidor = (res, error, contexto) => {
    console.error(`Error al ${contexto}:`, error);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
};

// ---------- Listar ----------

const listarRoles = async (req, res) => {
    try {
        const roles = await Rol.find().sort({ createdAt: 1 });
        const filas = await Usuario.aggregate([{ $unwind: '$roles' }, { $group: { _id: '$roles', total: { $sum: 1 } } }]);
        const conteo = Object.fromEntries(filas.map((f) => [f._id, f.total]));

        res.json(roles.map((rol) => presentar(req, rol, conteo[rol.nombre] || 0)));
    } catch (error) {
        errorServidor(res, error, 'listar los roles');
    }
};

// ---------- Crear ----------

const crearRol = async (req, res) => {
    try {
        const nombre = String(req.body?.nombre || '').trim();
        const descripcion = String(req.body?.descripcion || '').trim();
        const permisos = leerLista(req.body?.permisos);

        if (nombre.length < 2 || nombre.length > 40) {
            return res.status(400).json({ mensaje: 'El nombre del rol debe tener entre 2 y 40 caracteres.' });
        }
        if (!permisosValidos(permisos)) {
            return res.status(400).json({ mensaje: 'Alguno de los permisos no es válido.' });
        }
        if (permisos.length === 0) {
            return res.status(400).json({ mensaje: 'Seleccione al menos un permiso para el rol.' });
        }

        const noOtorgables = sensiblesNoOtorgables(req, permisos);
        if (noOtorgables.length > 0) {
            return res.status(403).json({
                mensaje: `No puede incluir permisos sensibles que usted no posee: ${nombresDe(noOtorgables)}.`
            });
        }

        const rol = await Rol.create({ nombre, descripcion, permisos, protegido: false, sistema: false });
        await recargarRoles();

        await registrarAccion({
            accion: 'ROL_CREADO',
            usuario: req.usuario,
            detalle: `${rol.nombre} · Permisos: ${permisos.join(', ')}`
        });

        res.status(201).json({ mensaje: 'Rol creado.', rol: presentar(req, rol, 0) });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ mensaje: 'Ya existe un rol con ese nombre.' });
        }
        if (error.name === 'ValidationError') {
            return res.status(400).json({ mensaje: error.message });
        }
        errorServidor(res, error, 'crear el rol');
    }
};

// ---------- Editar descripción y permisos ----------

const editarRol = async (req, res) => {
    try {
        const rol = await cargarRol(req, res);
        if (!rol) return;

        if (rol.nombre === 'Superadmin') {
            return res.status(403).json({ mensaje: 'El rol Superadmin no se puede modificar.' });
        }
        if (!puedeEditar(req, rol)) {
            return res.status(403).json({ mensaje: 'Este rol está protegido: solo un Superadmin puede modificarlo.' });
        }

        const cambios = [];

        if (req.body?.descripcion !== undefined) {
            const nueva = String(req.body.descripcion).trim();
            if (nueva !== rol.descripcion) {
                cambios.push('descripción actualizada');
                rol.descripcion = nueva;
            }
        }

        if (req.body?.permisos !== undefined) {
            const permisos = leerLista(req.body.permisos);
            if (!permisosValidos(permisos)) {
                return res.status(400).json({ mensaje: 'Alguno de los permisos no es válido.' });
            }
            if (permisos.length === 0) {
                return res.status(400).json({ mensaje: 'Un rol debe tener al menos un permiso.' });
            }

            const agregados = permisos.filter((p) => !rol.permisos.includes(p));
            const retirados = rol.permisos.filter((p) => !permisos.includes(p));

            const noOtorgables = sensiblesNoOtorgables(req, agregados);
            if (noOtorgables.length > 0) {
                return res.status(403).json({
                    mensaje: `No puede agregar permisos sensibles que usted no posee: ${nombresDe(noOtorgables)}.`
                });
            }

            if (agregados.length > 0 || retirados.length > 0) {
                cambios.push(`agregados: ${agregados.join(', ') || 'ninguno'}; retirados: ${retirados.join(', ') || 'ninguno'}`);
                rol.permisos = permisos;
            }
        }

        if (cambios.length === 0) {
            return res.status(400).json({ mensaje: 'No hay cambios para guardar.' });
        }

        await rol.save();
        await recargarRoles(); // los usuarios con este rol ven el cambio de inmediato

        await registrarAccion({
            accion: 'ROL_MODIFICADO',
            usuario: req.usuario,
            detalle: `${rol.nombre} · ${cambios.join(' · ')}`
        });

        const usuarios = await Usuario.countDocuments({ roles: rol.nombre });
        res.json({ mensaje: 'Rol actualizado. Los usuarios con este rol ya tienen los nuevos permisos.', rol: presentar(req, rol, usuarios) });
    } catch (error) {
        errorServidor(res, error, 'actualizar el rol');
    }
};

// ---------- Eliminar ----------

const eliminarRol = async (req, res) => {
    try {
        const rol = await cargarRol(req, res);
        if (!rol) return;

        if (rol.sistema) {
            return res.status(403).json({ mensaje: 'Los roles base del sistema no se pueden eliminar.' });
        }
        if (!puedeEditar(req, rol)) {
            return res.status(403).json({ mensaje: 'Este rol está protegido: solo un Superadmin puede eliminarlo.' });
        }

        const usuarios = await Usuario.countDocuments({ roles: rol.nombre });
        if (usuarios > 0) {
            return res.status(409).json({
                mensaje: `El rol está asignado a ${usuarios} usuario(s). Reasígnelos antes de eliminarlo.`
            });
        }

        await Rol.deleteOne({ _id: rol._id });
        await recargarRoles();

        await registrarAccion({ accion: 'ROL_ELIMINADO', usuario: req.usuario, detalle: rol.nombre });

        res.json({ mensaje: 'Rol eliminado.' });
    } catch (error) {
        errorServidor(res, error, 'eliminar el rol');
    }
};

module.exports = { listarRoles, crearRol, editarRol, eliminarRol };