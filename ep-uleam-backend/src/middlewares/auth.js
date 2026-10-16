const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Usuario = require('../models/Usuario');
const { armarSesion } = require('../utils/sesion');
const { registrarAccion } = require('../services/bitacora.service');

const INACTIVIDAD_MS = (Number(process.env.INACTIVIDAD_MINUTOS) || 15) * 60 * 1000;
const REFRESCO_ACTIVIDAD_MS = 30 * 1000; // la actividad se actualiza como máximo cada 30 s

// exigirPasswordActualizada = false permite pasar a quien aún debe cambiar su contraseña temporal
const crearVerificador = (exigirPasswordActualizada) => async (req, res, next) => {
    try {
        const authHeader = req.header('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ mensaje: 'Acceso denegado. No hay token provisto.' });
        }

        let payload;
        try {
            payload = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
        } catch {
            return res.status(401).json({ mensaje: 'Token inválido o expirado.' });
        }

        if (!mongoose.isValidObjectId(payload.id) || typeof payload.emitido !== 'number') {
            return res.status(401).json({ mensaje: 'Token inválido. Inicie sesión nuevamente.' });
        }

        const usuario = await Usuario.findById(payload.id);
        if (!usuario || !usuario.estado) {
            return res.status(401).json({ mensaje: 'La cuenta no está activa.' });
        }
        if (usuario.bloqueado) {
            return res.status(401).json({ mensaje: 'La cuenta está bloqueada.' });
        }

        // Sesión cerrada antes (logout, cambio de contraseña, baja, clave temporal)
        if (usuario.tokenValidoDesde && payload.emitido < usuario.tokenValidoDesde.getTime()) {
            return res.status(401).json({ mensaje: 'La sesión fue cerrada. Inicie sesión nuevamente.' });
        }

        const ahora = Date.now();

        // Cierre automático por inactividad (RF-02)
        if (usuario.ultimaActividad && ahora - usuario.ultimaActividad.getTime() > INACTIVIDAD_MS) {
            await Usuario.updateOne({ _id: usuario._id }, { tokenValidoDesde: new Date(ahora) });
            await registrarAccion({
                accion: 'CIERRE_SESION',
                usuario: armarSesion(usuario),
                detalle: 'Cierre automático por inactividad'
            });
            return res.status(401).json({
                mensaje: 'Sesión cerrada por inactividad. Inicie sesión nuevamente.',
                codigo: 'INACTIVIDAD'
            });
        }

        if (!usuario.ultimaActividad || ahora - usuario.ultimaActividad.getTime() > REFRESCO_ACTIVIDAD_MS) {
            await Usuario.updateOne({ _id: usuario._id }, { ultimaActividad: new Date(ahora) });
        }

        if (exigirPasswordActualizada && usuario.debeCambiarPassword) {
            return res.status(403).json({
                mensaje: 'Debe cambiar su contraseña temporal para continuar.',
                codigo: 'CAMBIO_PASSWORD_REQUERIDO'
            });
        }

        req.usuario = armarSesion(usuario);
        next();
    } catch (error) {
        console.error('Error al verificar la sesión:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
};

// Sesión válida y contraseña ya actualizada
const verificarToken = crearVerificador(true);

// Sesión válida, aunque aún deba cambiar la contraseña temporal (solo para cambiarla o cerrar sesión)
const verificarSesion = crearVerificador(false);

// Exige que el usuario tenga AL MENOS UNO de los permisos indicados
const requierePermiso = (...permisos) => (req, res, next) => {
    const tiene = req.usuario && permisos.some((p) => req.usuario.permisos.includes(p));
    if (!tiene) {
        return res.status(403).json({ mensaje: 'No tiene permisos para realizar esta acción.' });
    }
    next();
};

module.exports = { verificarToken, verificarSesion, requierePermiso };