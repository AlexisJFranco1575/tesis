const mongoose = require('mongoose');
const Tramite = require('../models/Tramite');
const servicio = require('../services/tramite.service');
const { cargarDocumentoAccesible } = require('../utils/documentoAcceso');

const { ErrorTramite } = servicio;

// Convierte los errores de negocio en la respuesta HTTP que corresponde
const manejar = (contexto, funcion) => async (req, res) => {
    try {
        await funcion(req, res);
    } catch (error) {
        if (error instanceof ErrorTramite) {
            return res.status(error.estado).json({ mensaje: error.message });
        }
        console.error(`Error al ${contexto}:`, error);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
};

// Solo el dueño de la bandeja puede actuar sobre su trámite
const cargarMiTramite = async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        res.status(404).json({ mensaje: 'Trámite no encontrado.' });
        return null;
    }
    const tramite = await Tramite.findOne({ _id: req.params.id, usuario: req.usuario.id });
    if (!tramite) {
        res.status(404).json({ mensaje: 'Trámite no encontrado.' });
        return null;
    }
    return tramite;
};

// GET /api/tramites?bandeja=recibidos&texto=...&soloVencidos=1
const listar = manejar('listar la bandeja', async (req, res) => {
    const bandeja = String(req.query.bandeja || 'recibidos');
    if (!servicio.BANDEJAS.includes(bandeja)) {
        return res.status(400).json({ mensaje: 'La bandeja indicada no existe.' });
    }

    const items = await servicio.listarBandeja(req.usuario, bandeja, {
        texto: String(req.query.texto || ''),
        soloVencidos: req.query.soloVencidos === '1'
    });
    res.json({ bandeja, items });
});

// GET /api/tramites/resumen
const resumen = manejar('calcular el resumen de bandejas', async (req, res) => {
    res.json(await servicio.resumenBandejas(req.usuario));
});

// GET /api/tramites/documento/:id
// Todo lo que un participante necesita ver del trámite de un documento
const detalleDeDocumento = manejar('consultar el trámite del documento', async (req, res) => {
    const documento = await cargarDocumentoAccesible(req, res);
    if (!documento) return;

    const mio = await servicio.miTramiteEn(documento._id, req.usuario.id);

    res.json({
        miTramite: mio ? servicio.presentarTramite(mio) : null,
        acciones: mio ? servicio.accionesDeTramite(mio, documento, req.usuario) : null,
        destinatarios: await servicio.destinatariosDe(documento),
        recorrido: await servicio.recorridoDe(documento)
    });
});

// POST /api/tramites/:id/leer
const leer = manejar('marcar como leído', async (req, res) => {
    const tramite = await cargarMiTramite(req, res);
    if (!tramite) return;

    const actualizado = await servicio.leer(tramite, req.usuario);
    res.json({ mensaje: 'Lectura registrada.', tramite: servicio.presentarTramite(actualizado) });
});

// POST /api/tramites/:id/reasignar
const reasignar = manejar('reasignar el documento', async (req, res) => {
    const tramite = await cargarMiTramite(req, res);
    if (!tramite) return;

    const fechaLimite = req.body?.fechaLimite ? new Date(req.body.fechaLimite) : null;
    if (fechaLimite && Number.isNaN(fechaLimite.getTime())) {
        return res.status(400).json({ mensaje: 'El plazo no es válido.' });
    }

    const resultado = await servicio.reasignar(tramite, req.usuario, {
        usuarios: req.body?.usuarios,
        comentario: String(req.body?.comentario || '').trim().slice(0, 500),
        fechaLimite
    });
    res.json({ mensaje: `Documento reasignado a ${resultado.total} persona(s).` });
});

// POST /api/tramites/:id/informar
const informar = manejar('informar el documento', async (req, res) => {
    const tramite = await cargarMiTramite(req, res);
    if (!tramite) return;

    const resultado = await servicio.informar(tramite, req.usuario, {
        usuarios: req.body?.usuarios,
        comentario: String(req.body?.comentario || '').trim().slice(0, 500)
    });
    res.json({ mensaje: `Se informó a ${resultado.total} persona(s).` });
});

// POST /api/tramites/:id/archivar
const archivar = manejar('archivar el trámite', async (req, res) => {
    const tramite = await cargarMiTramite(req, res);
    if (!tramite) return;

    await servicio.archivar(tramite, req.usuario, req.body?.comentario);
    res.json({ mensaje: 'Documento archivado.' });
});

// POST /api/tramites/:id/restaurar
const restaurar = manejar('restaurar el trámite', async (req, res) => {
    const tramite = await cargarMiTramite(req, res);
    if (!tramite) return;

    await servicio.restaurar(tramite, req.usuario);
    res.json({ mensaje: 'Documento restaurado a su bandeja.' });
});

module.exports = { listar, resumen, detalleDeDocumento, leer, reasignar, informar, archivar, restaurar };