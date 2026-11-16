const mongoose = require('mongoose');
const Documento = require('../models/Documento');
const Tramite = require('../models/Tramite');
const { esParticipante } = require('../utils/acceso');
const { resumenBandejas } = require('../services/tramite.service');
const { ESTADOS } = require('../config/flujo');
const { TIPOS_DOCUMENTO } = require('../config/clasificacion');

const contar = (lista, clave) => {
    const conteo = new Map();
    for (const elemento of lista) {
        const k = clave(elemento);
        conteo.set(k, (conteo.get(k) || 0) + 1);
    }
    return conteo;
};

// Últimos seis meses, del más antiguo al actual, con el formato AAAA-MM
const ultimosMeses = () => {
    const hoy = new Date();
    return Array.from({ length: 6 }, (_, i) => {
        const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - (5 - i), 1));
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    });
};

// GET /api/estadisticas
// Indicadores calculados solo con los documentos en los que el usuario participa.
const obtenerEstadisticas = async (req, res) => {
    try {
        const documentos = (
            await Documento.find()
                .select('estado tipoDocumento remitente.departamento destinatario createdAt bloqueado confidencial creadoPor involucrados')
                .lean()
        ).filter((d) => esParticipante(req.usuario, d));

        const porEstado = contar(documentos, (d) => d.estado);
        const porTipo = contar(documentos, (d) => d.tipoDocumento);
        const porArea = contar(documentos, (d) => d.remitente?.departamento || 'Sin área');
        const porMes = contar(documentos, (d) => new Date(d.createdAt).toISOString().slice(0, 7));

        const bandejas = await resumenBandejas(req.usuario);

        // Tiempo medio que tarda el usuario en abrir los documentos que recibe
        const [lectura] = await Tramite.aggregate([
            {
                $match: {
                    usuario: new mongoose.Types.ObjectId(req.usuario.id),
                    tipo: 'para',
                    fechaLectura: { $ne: null }
                }
            },
            { $group: { _id: null, ms: { $avg: { $subtract: ['$fechaLectura', '$createdAt'] } } } }
        ]);

        res.json({
            alcance: req.usuario.permisos.includes('documentos.verTodos') ? 'institucion' : 'personal',
            totales: {
                documentos: documentos.length,
                enRevision: porEstado.get('En Revisión') || 0,
                rechazados: porEstado.get('Rechazado') || 0,
                bloqueados: documentos.filter((d) => d.bloqueado).length,
                confidenciales: documentos.filter((d) => d.confidencial).length
            },
            porEstado: ESTADOS.map((clave) => ({ clave, total: porEstado.get(clave) || 0 })),
            porTipo: TIPOS_DOCUMENTO.map((clave) => ({ clave, total: porTipo.get(clave) || 0 })).filter((x) => x.total > 0),
            porArea: [...porArea.entries()]
                .map(([clave, total]) => ({ clave, total }))
                .sort((a, b) => b.total - a.total)
                .slice(0, 8),
            porMes: ultimosMeses().map((mes) => ({ mes, total: porMes.get(mes) || 0 })),
            tramite: {
                recibidosSinLeer: bandejas.recibidos.sinLeer,
                vencidos: bandejas.recibidos.vencidos,
                informadosSinLeer: bandejas.informados.sinLeer,
                tiempoMedioLecturaHoras: lectura ? Math.round((lectura.ms / 3600000) * 10) / 10 : null
            }
        });
    } catch (error) {
        console.error('Error al calcular las estadísticas:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
};

module.exports = { obtenerEstadisticas };