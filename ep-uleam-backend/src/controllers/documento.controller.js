// src/controllers/documento.controller.js
const Documento = require('../models/Documento');
const { generarHash } = require('../utils/hash.service');

const crearDocumento = async (req, res) => {
    try {
        const datos = req.body;

        const ultimoDocumento = await Documento.findOne().sort({ _id: -1 });
        const hashAnterior = ultimoDocumento ? ultimoDocumento.hashActual : '0000000000000000000000000000000000000000000000000000000000000000';

        const hashActual = generarHash(datos, hashAnterior);

        const nuevoDocumento = new Documento({
            ...datos,
            hashAnterior,
            hashActual
        });

        await nuevoDocumento.save();

        res.status(201).json({
            mensaje: 'Documento registrado y asegurado criptográficamente',
            documento: nuevoDocumento
        });

    } catch (error) {
        console.error('Error al crear documento:', error);
        res.status(500).json({ error: 'Error interno del servidor al procesar el documento' });
    }
};

const obtenerDocumentos = async (req, res) => {
    try {
        const documentos = await Documento.find().sort({ createdAt: -1 });
        res.status(200).json(documentos);
    } catch (error) {
        console.error('Error al obtener los documentos:', error);
        res.status(500).json({ error: 'Error interno del servidor al obtener los documentos' });
    }
};

module.exports = { crearDocumento, obtenerDocumentos };