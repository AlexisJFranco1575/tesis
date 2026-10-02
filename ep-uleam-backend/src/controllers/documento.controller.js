const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Documento = require('../models/Documento');
const Version = require('../models/Version');
const { hashArchivo } = require('../utils/hash.service');
const { registrarAccion } = require('../services/bitacora.service');
const { verificarVersiones, gestionarAlteracion, verificarDocumento } = require('../services/integridad.service');
const { ROLES_CONTROL } = require('../config/roles');

// ---------- Utilidades ----------

const borrarArchivo = (ruta) => {
    if (ruta) {
        fs.promises.unlink(ruta).catch(() => {});
    }
};

// Un PDF real comienza con los 5 caracteres "%PDF-"
const esPdfReal = async (ruta) => {
    const manejador = await fs.promises.open(ruta, 'r');
    try {
        const { bytesRead, buffer } = await manejador.read(Buffer.alloc(5), 0, 5, 0);
        return bytesRead === 5 && buffer.toString('latin1') === '%PDF-';
    } finally {
        await manejador.close();
    }
};

const leerObjeto = (valor) => {
    if (typeof valor === 'string') {
        try {
            return JSON.parse(valor);
        } catch {
            return null;
        }
    }
    return valor || null;
};

const personaValida = (p) =>
    !!p && typeof p.nombre === 'string' && p.nombre.trim() !== '' &&
    typeof p.departamento === 'string' && p.departamento.trim() !== '';

const idValido = (id) => mongoose.isValidObjectId(id);

const quienHizo = (usuario) => ({ id: String(usuario.id), nombre: usuario.nombreCompleto });

// ---------- CU-08: Registrar documento (incluye CU-09 y CU-19) ----------

const crearDocumento = async (req, res) => {
    const archivo = req.file;

    try {
        if (!archivo) {
            return res.status(400).json({ mensaje: 'Debe adjuntar el archivo PDF del documento.' });
        }

        const { codigoTramite, tipoDocumento, asunto } = req.body;
        const remitente = leerObjeto(req.body.remitente);
        const destinatario = leerObjeto(req.body.destinatario);

        if (!codigoTramite?.trim() || !tipoDocumento || !asunto?.trim() || !personaValida(remitente) || !personaValida(destinatario)) {
            borrarArchivo(archivo.path);
            return res.status(400).json({ mensaje: 'Faltan datos obligatorios del documento.' });
        }

        if (!(await esPdfReal(archivo.path))) {
            borrarArchivo(archivo.path);
            return res.status(400).json({ mensaje: 'El archivo no es un PDF válido.' });
        }

        const hash = await hashArchivo(archivo.path);
        const creadoPor = quienHizo(req.usuario);
        let documento;

        try {
            documento = await Documento.create({
                codigoTramite: codigoTramite.trim(),
                tipoDocumento,
                asunto: asunto.trim(),
                remitente,
                destinatario,
                versionActual: 1,
                hashActual: hash,
                creadoPor
            });

            await Version.create({
                documento: documento._id,
                numero: 1,
                nombreOriginal: archivo.originalname,
                rutaArchivo: archivo.path,
                tamanoBytes: archivo.size,
                hashArchivo: hash,
                comentario: 'Versión inicial',
                creadoPor
            });

            await registrarAccion({
                accion: 'REGISTRO_DOCUMENTO',
                documento: documento._id,
                codigoTramite: documento.codigoTramite,
                usuario: req.usuario,
                detalle: `Versión 1 · SHA-256 ${hash}`
            });
        } catch (error) {
            // Si algo falla a medias, se deshace el registro para no dejar datos huérfanos
            if (documento) {
                await Documento.deleteOne({ _id: documento._id });
                await Version.collection.deleteMany({ documento: documento._id });
            }
            throw error;
        }

        res.status(201).json({
            mensaje: 'Documento registrado con su hash SHA-256.',
            documento
        });

    } catch (error) {
        borrarArchivo(archivo?.path);

        if (error.code === 11000) {
            return res.status(409).json({ mensaje: 'Ya existe un documento con ese código de trámite.' });
        }
        if (error.name === 'ValidationError') {
            return res.status(400).json({ mensaje: error.message });
        }
        console.error('Error al crear documento:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor al procesar el documento.' });
    }
};

// ---------- Consultas ----------

const obtenerDocumentos = async (req, res) => {
    try {
        const documentos = await Documento.find().sort({ createdAt: -1 });
        res.status(200).json(documentos);
    } catch (error) {
        console.error('Error al obtener los documentos:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
};

const obtenerDocumento = async (req, res) => {
    try {
        if (!idValido(req.params.id)) {
            return res.status(404).json({ mensaje: 'Documento no encontrado.' });
        }
        const documento = await Documento.findById(req.params.id);
        if (!documento) {
            return res.status(404).json({ mensaje: 'Documento no encontrado.' });
        }
        res.json(documento);
    } catch (error) {
        console.error('Error al obtener el documento:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
};

// ---------- CU-15 y CU-17: Versiones ----------

const listarVersiones = async (req, res) => {
    try {
        if (!idValido(req.params.id)) {
            return res.status(404).json({ mensaje: 'Documento no encontrado.' });
        }
        const documento = await Documento.findById(req.params.id);
        if (!documento) {
            return res.status(404).json({ mensaje: 'Documento no encontrado.' });
        }

        const versiones = await Version.find({ documento: documento._id }).sort({ numero: -1 }).lean();

        // No se expone la ruta interna del archivo
        res.json(versiones.map((v) => ({
            numero: v.numero,
            nombreOriginal: v.nombreOriginal,
            tamanoBytes: v.tamanoBytes,
            hashArchivo: v.hashArchivo,
            comentario: v.comentario,
            creadoPor: v.creadoPor,
            createdAt: v.createdAt,
            esActual: v.numero === documento.versionActual
        })));
    } catch (error) {
        console.error('Error al listar versiones:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
};

// ---------- CU-16: Crear nueva versión (incluye CU-19) ----------

const crearVersion = async (req, res) => {
    const archivo = req.file;

    try {
        if (!archivo) {
            return res.status(400).json({ mensaje: 'Debe adjuntar el archivo PDF de la nueva versión.' });
        }
        if (!idValido(req.params.id)) {
            borrarArchivo(archivo.path);
            return res.status(404).json({ mensaje: 'Documento no encontrado.' });
        }

        const documento = await Documento.findById(req.params.id);
        if (!documento) {
            borrarArchivo(archivo.path);
            return res.status(404).json({ mensaje: 'Documento no encontrado.' });
        }
        if (documento.bloqueado) {
            borrarArchivo(archivo.path);
            return res.status(423).json({ mensaje: 'El documento está bloqueado por una alerta de alteración. No admite nuevas versiones.' });
        }
        if (!(await esPdfReal(archivo.path))) {
            borrarArchivo(archivo.path);
            return res.status(400).json({ mensaje: 'El archivo no es un PDF válido.' });
        }

        const hash = await hashArchivo(archivo.path);
        const numero = documento.versionActual + 1;
        const comentario = (req.body.comentario || '').trim();

        await Version.create({
            documento: documento._id,
            numero,
            nombreOriginal: archivo.originalname,
            rutaArchivo: archivo.path,
            tamanoBytes: archivo.size,
            hashArchivo: hash,
            comentario,
            creadoPor: quienHizo(req.usuario)
        });

        documento.versionActual = numero;
        documento.hashActual = hash;
        await documento.save();

        await registrarAccion({
            accion: 'NUEVA_VERSION',
            documento: documento._id,
            codigoTramite: documento.codigoTramite,
            usuario: req.usuario,
            detalle: `Versión ${numero} · SHA-256 ${hash}${comentario ? ` · ${comentario}` : ''}`
        });

        res.status(201).json({
            mensaje: `Versión ${numero} registrada con su hash SHA-256.`,
            documento
        });

    } catch (error) {
        borrarArchivo(archivo?.path);

        if (error.code === 11000) {
            return res.status(409).json({ mensaje: 'Se registró otra versión al mismo tiempo. Intente nuevamente.' });
        }
        console.error('Error al crear la versión:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor al crear la versión.' });
    }
};

// ---------- CU-12 y CU-13: Consultar / descargar una versión ----------
// Antes de entregar el archivo se comprueba su integridad.

const descargarVersion = async (req, res) => {
    try {
        const { id, numero } = req.params;
        if (!idValido(id)) {
            return res.status(404).json({ mensaje: 'Documento no encontrado.' });
        }

        const documento = await Documento.findById(id);
        if (!documento) {
            return res.status(404).json({ mensaje: 'Documento no encontrado.' });
        }

        const version = await Version.findOne({ documento: documento._id, numero: Number(numero) });
        if (!version) {
            return res.status(404).json({ mensaje: 'Versión no encontrada.' });
        }

        if (documento.bloqueado && !ROLES_CONTROL.includes(req.usuario.rol)) {
            return res.status(423).json({ mensaje: 'El documento está bloqueado por una alerta de alteración.' });
        }

        const [resultado] = await verificarVersiones([version]);
        if (!resultado.coincide) {
            await gestionarAlteracion(documento, [resultado], req.usuario);
            return res.status(409).json({
                mensaje: 'ALERTA: el archivo no coincide con su hash SHA-256 registrado. El documento fue bloqueado.'
            });
        }

        const verEnPantalla = req.query.modo === 'ver';
        await registrarAccion({
            accion: verEnPantalla ? 'CONSULTA_DOCUMENTO' : 'DESCARGA_DOCUMENTO',
            documento: documento._id,
            codigoTramite: documento.codigoTramite,
            usuario: req.usuario,
            detalle: `Versión ${version.numero}`
        });

        const rutaAbsoluta = path.resolve(version.rutaArchivo);

        if (verEnPantalla) {
            res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(version.nombreOriginal)}`);
            return res.sendFile(rutaAbsoluta);
        }

        res.download(rutaAbsoluta, version.nombreOriginal, (err) => {
            if (err && !res.headersSent) {
                res.status(500).json({ mensaje: 'No se pudo enviar el archivo.' });
            }
        });

    } catch (error) {
        console.error('Error al descargar la versión:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
};

// ---------- CU-20 y CU-21: Verificar integridad ----------

const verificarIntegridad = async (req, res) => {
    try {
        if (!idValido(req.params.id)) {
            return res.status(404).json({ mensaje: 'Documento no encontrado.' });
        }
        const documento = await Documento.findById(req.params.id);
        if (!documento) {
            return res.status(404).json({ mensaje: 'Documento no encontrado.' });
        }

        const resultado = await verificarDocumento(documento, req.usuario);

        let mensaje;
        if (resultado.sinHash) {
            mensaje = 'No es posible verificar: el documento no tiene hash registrado.';
        } else if (resultado.valido) {
            mensaje = 'Integridad verificada: todas las versiones coinciden con su hash SHA-256 registrado.';
        } else {
            mensaje = 'ALERTA: se detectó alteración. El documento fue bloqueado y el incidente quedó registrado en la trazabilidad.';
        }

        res.json({
            mensaje,
            valido: resultado.valido,
            sinHash: resultado.sinHash,
            bloqueado: documento.bloqueado,
            documento: {
                _id: documento._id,
                codigoTramite: documento.codigoTramite,
                versionActual: documento.versionActual
            },
            versiones: resultado.versiones
        });

    } catch (error) {
        console.error('Error al verificar integridad:', error);
        res.status(500).json({ mensaje: 'Error interno durante la verificación.' });
    }
};

// ---------- Desbloqueo (solo si la verificación vuelve a salir limpia) ----------

const desbloquearDocumento = async (req, res) => {
    try {
        const motivo = (req.body?.motivo || '').trim();
        if (!motivo) {
            return res.status(400).json({ mensaje: 'Debe indicar el motivo del desbloqueo.' });
        }
        if (!idValido(req.params.id)) {
            return res.status(404).json({ mensaje: 'Documento no encontrado.' });
        }

        const documento = await Documento.findById(req.params.id);
        if (!documento) {
            return res.status(404).json({ mensaje: 'Documento no encontrado.' });
        }
        if (!documento.bloqueado) {
            return res.status(400).json({ mensaje: 'El documento no está bloqueado.' });
        }

        const versiones = await Version.find({ documento: documento._id }).sort({ numero: 1 });
        const resultados = await verificarVersiones(versiones);

        if (!resultados.every((r) => r.coincide)) {
            return res.status(409).json({
                mensaje: 'No se puede desbloquear: el documento sigue alterado.',
                versiones: resultados
            });
        }

        documento.bloqueado = false;
        documento.motivoBloqueo = '';
        await documento.save();

        await registrarAccion({
            accion: 'DESBLOQUEO',
            documento: documento._id,
            codigoTramite: documento.codigoTramite,
            usuario: req.usuario,
            detalle: `Motivo: ${motivo}`
        });

        res.json({ mensaje: 'Documento desbloqueado.', documento });

    } catch (error) {
        console.error('Error al desbloquear:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
};

module.exports = {
    crearDocumento,
    obtenerDocumentos,
    obtenerDocumento,
    listarVersiones,
    crearVersion,
    descargarVersion,
    verificarIntegridad,
    desbloquearDocumento
};