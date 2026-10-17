const mongoose = require('mongoose');
const Notificacion = require('../models/Notificacion');

// GET /api/notificaciones?soloNoLeidas=1&limite=30
const listarNotificaciones = async (req, res) => {
    try {
        const limite = Math.min(Number(req.query.limite) || 30, 100);
        const filtro = { usuario: req.usuario.id };
        if (req.query.soloNoLeidas === '1') {
            filtro.leida = false;
        }

        const [notificaciones, noLeidas] = await Promise.all([
            Notificacion.find(filtro).sort({ createdAt: -1 }).limit(limite).lean(),
            Notificacion.countDocuments({ usuario: req.usuario.id, leida: false })
        ]);

        res.json({ notificaciones, noLeidas });
    } catch (error) {
        console.error('Error al listar las notificaciones:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
};

// PATCH /api/notificaciones/:id/leida
const marcarLeida = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(404).json({ mensaje: 'Notificación no encontrada.' });
        }

        // Solo el destinatario puede marcar su propia notificación
        const resultado = await Notificacion.updateOne(
            { _id: req.params.id, usuario: req.usuario.id },
            { leida: true, fechaLectura: new Date() }
        );
        if (resultado.matchedCount === 0) {
            return res.status(404).json({ mensaje: 'Notificación no encontrada.' });
        }

        res.json({ mensaje: 'Notificación marcada como leída.' });
    } catch (error) {
        console.error('Error al marcar la notificación:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
};

// POST /api/notificaciones/leer-todas
const marcarTodasLeidas = async (req, res) => {
    try {
        await Notificacion.updateMany(
            { usuario: req.usuario.id, leida: false },
            { leida: true, fechaLectura: new Date() }
        );
        res.json({ mensaje: 'Todas las notificaciones fueron marcadas como leídas.' });
    } catch (error) {
        console.error('Error al marcar las notificaciones:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
};

module.exports = { listarNotificaciones, marcarLeida, marcarTodasLeidas };