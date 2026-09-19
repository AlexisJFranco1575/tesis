// src/controllers/documento.controller.js
const Documento = require('../models/Documento');
const { generarHash } = require('../utils/hash.service');
const fs = require('fs');

const crearDocumento = async (req, res) => {
    try {
        // En multipart/form-data, los objetos anidados pueden llegar como strings JSON. Los parseamos de forma segura.
        const remitente = typeof req.body.remitente === 'string' ? JSON.parse(req.body.remitente) : req.body.remitente;
        const destinatario = typeof req.body.destinatario === 'string' ? JSON.parse(req.body.destinatario) : req.body.destinatario;

        const datos = {
            codigoTramite: req.body.codigoTramite,
            tipoDocumento: req.body.tipoDocumento,
            asunto: req.body.asunto,
            estado: req.body.estado,
            remitente,
            destinatario
        };

        const rutaArchivo = req.file ? req.file.path : '';
        datos.urlArchivo = rutaArchivo;

        const ultimoDocumento = await Documento.findOne().sort({ _id: -1 });
        const hashAnterior = ultimoDocumento ? ultimoDocumento.hashActual : '0000000000000000000000000000000000000000000000000000000000000000';

        // Generamos el hash incluyendo el archivo físico
        const hashActual = generarHash(datos, hashAnterior, rutaArchivo);

        const nuevoDocumento = new Documento({
            ...datos,
            hashAnterior,
            hashActual
        });

        await nuevoDocumento.save();

        res.status(201).json({
            mensaje: 'Documento y archivo registrados con integridad criptográfica.',
            documento: nuevoDocumento
        });

    } catch (error) {
        console.error('Error al crear documento:', error);
        res.status(500).json({ error: 'Error interno del servidor al procesar el documento.' });
    }
};

const obtenerDocumentos = async (req, res) => {
    try {
        const documentos = await Documento.find().sort({ createdAt: -1 });
        res.status(200).json(documentos);
    } catch (error) {
        console.error('Error al obtener los documentos:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const validarCadena = async (req, res) => {
    try {
        const documentos = await Documento.find().sort({ createdAt: 1 });

        if (documentos.length === 0) {
            return res.status(200).json({ mensaje: 'No hay documentos para validar.', valido: true });
        }

        let cadenaValida = true;
        let errores = [];

        for (let i = 0; i < documentos.length; i++) {
            const docActual = documentos[i];

            if (i === 0) {
                if (docActual.hashAnterior !== '0000000000000000000000000000000000000000000000000000000000000000') {
                    cadenaValida = false;
                    errores.push(`Bloque Génesis alterado (ID: ${docActual._id}).`);
                }
            } else {
                const docPrevio = documentos[i - 1];
                if (docActual.hashAnterior !== docPrevio.hashActual) {
                    cadenaValida = false;
                    errores.push(`Ruptura de cadena entre el documento ID: ${docPrevio._id} y ID: ${docActual._id}.`);
                }
            }

            // Recalculamos el hash reconstruyendo el objeto base y leyendo su archivo físico
            const datosReconstruidos = {
                codigoTramite: docActual.codigoTramite,
                tipoDocumento: docActual.tipoDocumento,
                asunto: docActual.asunto
            };
            
            const hashRecalculado = generarHash(datosReconstruidos, docActual.hashAnterior, docActual.urlArchivo);

            if (hashRecalculado !== docActual.hashActual) {
                cadenaValida = false;
                errores.push(`Inconsistencia criptográfica en ID: ${docActual._id}. Los metadatos o el archivo físico (.pdf) fueron manipulados.`);
            }
        }

        if (cadenaValida) {
            return res.status(200).json({
                mensaje: 'Auditoría exitosa: La cadena criptográfica y los archivos físicos están intactos.',
                valido: true,
                totalAnalizados: documentos.length
            });
        } else {
            return res.status(409).json({
                mensaje: 'ALERTA CRÍTICA: Se detectó alteración en la información.',
                valido: false,
                detalles: errores
            });
        }

    } catch (error) {
        console.error('Error en auditoría:', error);
        res.status(500).json({ error: 'Error interno durante la auditoría.' });
    }
};
const limpiarBaseDeDatos = async (req, res) => {
    try {
        await Documento.deleteMany({});
        res.status(200).json({ mensaje: 'Base de datos limpiada. Listo para iniciar el Bloque Génesis definitivo.' });
    } catch (error) {
        res.status(500).json({ error: 'Error al limpiar la base de datos.' });
    }
};
module.exports = { crearDocumento, obtenerDocumentos, validarCadena, limpiarBaseDeDatos };