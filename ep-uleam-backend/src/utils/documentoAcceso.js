const mongoose = require('mongoose');
const Documento = require('../models/Documento');
const { esParticipante } = require('./acceso');

const idValido = (id) => mongoose.isValidObjectId(id);

// Carga el documento de la ruta (req.params.id) y comprueba que el usuario participe en él.
// Si no existe o no tiene acceso, responde y devuelve null.
// Con paraIntegridad, quien puede verificar la integridad accede aunque el documento sea confidencial
// (esas operaciones solo muestran hashes, nunca el contenido).
const cargarDocumentoAccesible = async (req, res, { paraIntegridad = false } = {}) => {
    if (!idValido(req.params.id)) {
        res.status(404).json({ mensaje: 'Documento no encontrado.' });
        return null;
    }
    const documento = await Documento.findById(req.params.id);
    if (!documento) {
        res.status(404).json({ mensaje: 'Documento no encontrado.' });
        return null;
    }

    const acceso =
        esParticipante(req.usuario, documento) ||
        (paraIntegridad && req.usuario.permisos.includes('integridad.verificar'));
    if (!acceso) {
        res.status(403).json({ mensaje: 'No tiene acceso a este documento.' });
        return null;
    }
    return documento;
};

module.exports = { idValido, cargarDocumentoAccesible };