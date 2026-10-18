const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Documento = require('../models/Documento');
const Version = require('../models/Version');
const Anexo = require('../models/Anexo');
const Contador = require('../models/Contador');
const { hashArchivo } = require('../utils/hash.service');
const { esParticipante, transicionesPara } = require('../utils/acceso');
const { ESTADOS, TRANSICIONES, ESTADOS_EDITABLES } = require('../config/flujo');
const { TIPOS_ANEXO } = require('../config/clasificacion');
const { registrarAccion } = require('../services/bitacora.service');
const { notificarFlujo } = require('../services/notificacion.service');
const {
    verificarVersiones,
    verificarAnexos,
    gestionarAlteracion,
    verificarDocumento
} = require('../services/integridad.service');

// ---------- Utilidades ----------

const borrarArchivo = (ruta) => {
    if (ruta) {
        fs.promises.unlink(ruta).catch(() => {});
    }
};

const borrarArchivos = (archivos = []) => archivos.forEach((a) => borrarArchivo(a.path));

// Lee los primeros bytes de un archivo
const leerCabecera = async (ruta, bytes = 8) => {
    const manejador = await fs.promises.open(ruta, 'r');
    try {
        const { bytesRead, buffer } = await manejador.read(Buffer.alloc(bytes), 0, bytes, 0);
        return buffer.subarray(0, bytesRead);
    } finally {
        await manejador.close();
    }
};

// Un PDF real comienza con los 5 caracteres "%PDF-"
const esPdfReal = async (ruta) => (await leerCabecera(ruta, 5)).toString('latin1') === '%PDF-';

// Firmas de los formatos permitidos para anexos (se comprueba el contenido, no solo la extensión)
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // DOCX y XLSX son archivos ZIP
const FIRMAS_ANEXO = {
    'application/pdf': Buffer.from('%PDF-', 'latin1'),
    'image/png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    'image/jpeg': Buffer.from([0xff, 0xd8, 0xff]),
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ZIP,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ZIP
};

const firmaAnexoValida = async (ruta, mimetype) => {
    const firma = FIRMAS_ANEXO[mimetype];
    if (!firma) {
        return false;
    }
    const cabecera = await leerCabecera(ruta, firma.length);
    return cabecera.length === firma.length && cabecera.equals(firma);
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

const parsearFecha = (valor) => {
    if (!valor) {
        return null;
    }
    const fecha = new Date(valor);
    return Number.isNaN(fecha.getTime()) ? null : fecha;
};

const soloFecha = (fecha) => (fecha ? new Date(fecha).toISOString().slice(0, 10) : '');

const idValido = (id) => mongoose.isValidObjectId(id);

const quienHizo = (usuario) => ({ id: String(usuario.id), nombre: usuario.nombreCompleto });

// Identificador único consecutivo por año, ej: EP-ULEAM-2026-0001 (CU-08 paso 7)
const generarCodigoTramite = async () => {
    const anio = new Date().getFullYear();
    const contador = await Contador.findOneAndUpdate(
        { _id: `documento-${anio}` },
        { $inc: { valor: 1 } },
        { upsert: true, returnDocument: 'after' }
    );
    return `EP-ULEAM-${anio}-${String(contador.valor).padStart(4, '0')}`;
};

// Carga el documento de la ruta y comprueba que el usuario participe en él.
// Si no existe o no tiene acceso, responde y devuelve null.
const cargarDocumentoAccesible = async (req, res) => {
    if (!idValido(req.params.id)) {
        res.status(404).json({ mensaje: 'Documento no encontrado.' });
        return null;
    }
    const documento = await Documento.findById(req.params.id);
    if (!documento) {
        res.status(404).json({ mensaje: 'Documento no encontrado.' });
        return null;
    }
    if (!esParticipante(req.usuario, documento)) {
        res.status(403).json({ mensaje: 'No tiene acceso a este documento.' });
        return null;
    }
    return documento;
};

// Qué acciones de edición están disponibles para el usuario sobre el documento
const accionesPara = (documento, usuario) => {
    const editable = !documento.bloqueado && ESTADOS_EDITABLES.includes(documento.estado);
    return {
        modificar: editable && usuario.permisos.includes('documentos.modificar'),
        versionar: editable && usuario.permisos.includes('documentos.versionar'),
        anexar: editable && usuario.permisos.includes('documentos.anexar')
    };
};

// El documento más lo que el usuario puede hacer con él ahora mismo
const presentar = (documento, usuario) => ({
    ...documento.toJSON(),
    transicionesPermitidas: transicionesPara(documento, usuario),
    acciones: accionesPara(documento, usuario)
});

// No se expone la ruta interna del archivo
const presentarAnexo = (a) => ({
    _id: a._id,
    nombreOriginal: a.nombreOriginal,
    extension: path.extname(a.nombreOriginal).toLowerCase(),
    tamanoBytes: a.tamanoBytes,
    hashArchivo: a.hashArchivo,
    tipoAnexo: a.tipoAnexo,
    descripcion: a.descripcion,
    creadoPor: a.creadoPor,
    createdAt: a.createdAt
});

// ---------- CU-08: Registrar documento (incluye CU-09, CU-10 y CU-19) ----------

const crearDocumento = async (req, res) => {
    const archivo = req.file;

    try {
        if (!archivo) {
            return res.status(400).json({ mensaje: 'Debe adjuntar el archivo PDF del documento.' });
        }

        const tipoDocumento = req.body.tipoDocumento;
        const numeroOficio = String(req.body.numeroOficio || '').trim().toUpperCase();
        const asunto = String(req.body.asunto || '').trim();
        const motivo = String(req.body.motivo || '').trim();
        const observacion = String(req.body.observacion || '').trim();
        const fechaOficio = parsearFecha(req.body.fechaOficio);
        const remitente = leerObjeto(req.body.remitente);
        const destinatario = leerObjeto(req.body.destinatario);

        // A1: datos obligatorios
        if (!numeroOficio || !fechaOficio || !tipoDocumento || !asunto || !motivo || !personaValida(remitente) || !personaValida(destinatario)) {
            borrarArchivo(archivo.path);
            return res.status(400).json({
                mensaje: 'Faltan datos obligatorios: número de oficio, fecha, tipo, asunto, motivo, remitente y destinatario.'
            });
        }

        // A2: el número de oficio no puede repetirse
        if (await Documento.exists({ numeroOficio })) {
            borrarArchivo(archivo.path);
            return res.status(409).json({ mensaje: 'Ya existe un documento registrado con ese número de oficio.' });
        }

        // A3: el archivo debe ser un PDF válido
        if (!(await esPdfReal(archivo.path))) {
            borrarArchivo(archivo.path);
            return res.status(400).json({ mensaje: 'El archivo no es un PDF válido.' });
        }

        const hash = await hashArchivo(archivo.path);
        const creadoPor = quienHizo(req.usuario);
        let documento;

        try {
            documento = await Documento.create({
                codigoTramite: await generarCodigoTramite(),
                numeroOficio,
                fechaOficio,
                motivo,
                observacion,
                tipoDocumento,
                asunto,
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
                detalle: `Oficio ${numeroOficio} · Versión 1 · SHA-256 ${hash}`
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
            mensaje: `Documento registrado con el código ${documento.codigoTramite} y su hash SHA-256.`,
            documento
        });

    } catch (error) {
        borrarArchivo(archivo?.path);

        if (error.code === 11000) {
            const campo = error.keyPattern?.numeroOficio ? 'ese número de oficio' : 'ese código';
            return res.status(409).json({ mensaje: `Ya existe un documento con ${campo}.` });
        }
        if (error.name === 'ValidationError') {
            return res.status(400).json({ mensaje: error.message });
        }
        console.error('Error al crear documento:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor al procesar el documento.' });
    }
};

// ---------- Consultas ----------

// Cada usuario ve únicamente los documentos en los que participa
const obtenerDocumentos = async (req, res) => {
    try {
        const documentos = await Documento.find().sort({ createdAt: -1 });
        res.status(200).json(documentos.filter((d) => esParticipante(req.usuario, d)));
    } catch (error) {
        console.error('Error al obtener los documentos:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
};

const obtenerDocumento = async (req, res) => {
    try {
        const documento = await cargarDocumentoAccesible(req, res);
        if (!documento) return;

        res.json(presentar(documento, req.usuario));
    } catch (error) {
        console.error('Error al obtener el documento:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
};

// ---------- CU-14: Modificar documento ----------
// Se pueden modificar asunto, tipo, fecha, motivo, observación y destinatario.
// El número de oficio y el código no cambian. Lo anterior queda en la bitácora.

const modificarDocumento = async (req, res) => {
    try {
        const documento = await cargarDocumentoAccesible(req, res);
        if (!documento) return;

        if (documento.bloqueado) {
            return res.status(423).json({ mensaje: 'El documento está bloqueado por una alerta de alteración.' });
        }
        if (!ESTADOS_EDITABLES.includes(documento.estado)) {
            return res.status(409).json({
                mensaje: `Un documento en estado "${documento.estado}" no puede modificarse. Debe estar en Generado o Rechazado.`
            });
        }

        const cambios = [];
        const { asunto, tipoDocumento, motivo, observacion, fechaOficio } = req.body || {};
        const destinatario = leerObjeto(req.body?.destinatario);

        if (asunto !== undefined) {
            const nuevo = String(asunto).trim();
            if (!nuevo) {
                return res.status(400).json({ mensaje: 'El asunto no puede quedar vacío.' });
            }
            if (nuevo !== documento.asunto) {
                cambios.push(`asunto: "${documento.asunto}" → "${nuevo}"`);
                documento.asunto = nuevo;
            }
        }

        if (motivo !== undefined) {
            const nuevo = String(motivo).trim();
            if (!nuevo) {
                return res.status(400).json({ mensaje: 'El motivo no puede quedar vacío.' });
            }
            if (nuevo !== documento.motivo) {
                cambios.push(`motivo: "${documento.motivo}" → "${nuevo}"`);
                documento.motivo = nuevo;
            }
        }

        if (observacion !== undefined) {
            const nuevo = String(observacion).trim();
            if (nuevo !== (documento.observacion || '')) {
                cambios.push(`observación: "${documento.observacion || ''}" → "${nuevo}"`);
                documento.observacion = nuevo;
            }
        }

        if (fechaOficio !== undefined) {
            const nueva = parsearFecha(fechaOficio);
            if (!nueva) {
                return res.status(400).json({ mensaje: 'La fecha del oficio no es válida.' });
            }
            if (soloFecha(nueva) !== soloFecha(documento.fechaOficio)) {
                cambios.push(`fecha del oficio: "${soloFecha(documento.fechaOficio)}" → "${soloFecha(nueva)}"`);
                documento.fechaOficio = nueva;
            }
        }

        if (tipoDocumento !== undefined && tipoDocumento !== documento.tipoDocumento) {
            cambios.push(`tipo: "${documento.tipoDocumento}" → "${tipoDocumento}"`);
            documento.tipoDocumento = tipoDocumento;
        }

        if (destinatario) {
            if (!personaValida(destinatario)) {
                return res.status(400).json({ mensaje: 'El destinatario debe tener nombre y departamento.' });
            }
            const actual = documento.destinatario;
            if (destinatario.nombre.trim() !== actual.nombre || destinatario.departamento.trim() !== actual.departamento) {
                cambios.push(
                    `destinatario: "${actual.nombre} (${actual.departamento})" → "${destinatario.nombre.trim()} (${destinatario.departamento.trim()})"`
                );
                documento.destinatario = {
                    nombre: destinatario.nombre.trim(),
                    departamento: destinatario.departamento.trim()
                };
            }
        }

        if (cambios.length === 0) {
            return res.status(400).json({ mensaje: 'No hay cambios para guardar.' });
        }

        await documento.save();

        await registrarAccion({
            accion: 'MODIFICACION_DOCUMENTO',
            documento: documento._id,
            codigoTramite: documento.codigoTramite,
            usuario: req.usuario,
            detalle: cambios.join(' · ')
        });

        res.json({
            mensaje: 'Documento actualizado. Los datos anteriores quedaron en la trazabilidad.',
            documento: presentar(documento, req.usuario)
        });

    } catch (error) {
        if (error.name === 'ValidationError') {
            return res.status(400).json({ mensaje: error.message });
        }
        console.error('Error al modificar el documento:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
};

// ---------- CU-22 a CU-25: Cambiar el estado (revisión, aprobación, rechazo y flujo) ----------

const EVENTOS_FLUJO = {
    'En Revisión': 'ENVIADO_REVISION',
    'Aprobado': 'APROBADO',
    'Rechazado': 'RECHAZADO',
    'Distribuido': 'DISTRIBUIDO',
    'Archivado': 'ARCHIVADO',
    'Generado': 'RECUPERADO'
};

const cambiarEstado = async (req, res) => {
    try {
        const documento = await cargarDocumentoAccesible(req, res);
        if (!documento) return;

        const nuevo = String(req.body?.estado || '');
        const observacion = String(req.body?.observacion || '').trim();

        if (!ESTADOS.includes(nuevo)) {
            return res.status(400).json({ mensaje: 'El estado indicado no es válido.' });
        }
        if (documento.bloqueado) {
            return res.status(423).json({ mensaje: 'El documento está bloqueado por una alerta de alteración.' });
        }

        // A2: el cambio debe corresponder al flujo documental
        const permisoNecesario = TRANSICIONES[documento.estado]?.[nuevo];
        if (!permisoNecesario) {
            return res.status(409).json({
                mensaje: `El cambio de "${documento.estado}" a "${nuevo}" no corresponde al flujo documental.`
            });
        }

        // A1: el usuario debe estar autorizado para ese cambio
        if (!req.usuario.permisos.includes(permisoNecesario)) {
            return res.status(403).json({ mensaje: 'No tiene autorización para realizar este cambio de estado.' });
        }

        // CU-24 A1: el rechazo exige la observación
        if (nuevo === 'Rechazado' && !observacion) {
            return res.status(400).json({ mensaje: 'Debe registrar la observación con el motivo del rechazo.' });
        }

        const anterior = documento.estado;
        const esDecision = nuevo === 'Aprobado' || nuevo === 'Rechazado';

        documento.estado = nuevo;
        if (esDecision) {
            documento.revisiones.push({
                decision: nuevo,
                observacion,
                version: documento.versionActual,
                por: { id: req.usuario.id, nombre: req.usuario.nombreCompleto, rol: req.usuario.rol },
                fecha: new Date()
            });
        }
        await documento.save();

        let accion = 'CAMBIO_ESTADO';
        if (nuevo === 'Aprobado') accion = 'REVISION_APROBADA';
        if (nuevo === 'Rechazado') accion = 'REVISION_RECHAZADA';

        await registrarAccion({
            accion,
            documento: documento._id,
            codigoTramite: documento.codigoTramite,
            usuario: req.usuario,
            detalle: `${anterior} → ${nuevo}${esDecision && observacion ? ` · Observación: ${observacion}` : ''}`
        });

        try {
            await notificarFlujo({ evento: EVENTOS_FLUJO[nuevo], documento, actor: req.usuario, observacion });
        } catch (error) {
            console.error('Error al notificar el cambio de estado:', error.message);
        }

        res.json({ mensaje: `Estado actualizado a "${nuevo}".`, documento: presentar(documento, req.usuario) });

    } catch (error) {
        console.error('Error al cambiar el estado:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
};

// ---------- CU-15 y CU-17: Versiones ----------

const listarVersiones = async (req, res) => {
    try {
        const documento = await cargarDocumentoAccesible(req, res);
        if (!documento) return;

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

        const documento = await cargarDocumentoAccesible(req, res);
        if (!documento) {
            borrarArchivo(archivo.path);
            return;
        }

        if (documento.bloqueado) {
            borrarArchivo(archivo.path);
            return res.status(423).json({ mensaje: 'El documento está bloqueado por una alerta de alteración. No admite nuevas versiones.' });
        }
        if (!ESTADOS_EDITABLES.includes(documento.estado)) {
            borrarArchivo(archivo.path);
            return res.status(409).json({
                mensaje: `Un documento en estado "${documento.estado}" no admite nuevas versiones. Debe estar en Generado o Rechazado.`
            });
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
            documento: presentar(documento, req.usuario)
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
        const documento = await cargarDocumentoAccesible(req, res);
        if (!documento) return;

        const version = await Version.findOne({ documento: documento._id, numero: Number(req.params.numero) });
        if (!version) {
            return res.status(404).json({ mensaje: 'Versión no encontrada.' });
        }

        // Un documento bloqueado solo lo abre quien puede verificar su integridad
        if (documento.bloqueado && !req.usuario.permisos.includes('integridad.verificar')) {
            return res.status(423).json({ mensaje: 'El documento está bloqueado por una alerta de alteración.' });
        }

        const [resultado] = await verificarVersiones([version]);
        if (!resultado.coincide) {
            await gestionarAlteracion(documento, { versiones: [resultado] }, req.usuario);
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

// ---------- CU-09 y CU-10: Anexos ----------

const listarAnexos = async (req, res) => {
    try {
        const documento = await cargarDocumentoAccesible(req, res);
        if (!documento) return;

        const anexos = await Anexo.find({ documento: documento._id }).sort({ createdAt: 1 });
        res.json(anexos.map(presentarAnexo));
    } catch (error) {
        console.error('Error al listar anexos:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
};

// Carga uno o varios archivos como anexos. Todos reciben el mismo tipo documental y descripción.
const subirAnexos = async (req, res) => {
    const archivos = req.files || [];
    const creados = [];

    try {
        if (archivos.length === 0) {
            return res.status(400).json({ mensaje: 'Seleccione al menos un archivo para adjuntar.' });
        }

        const documento = await cargarDocumentoAccesible(req, res);
        if (!documento) {
            borrarArchivos(archivos);
            return;
        }

        if (documento.bloqueado) {
            borrarArchivos(archivos);
            return res.status(423).json({ mensaje: 'El documento está bloqueado por una alerta de alteración. No admite anexos.' });
        }
        if (!ESTADOS_EDITABLES.includes(documento.estado)) {
            borrarArchivos(archivos);
            return res.status(409).json({
                mensaje: `Un documento en estado "${documento.estado}" no admite anexos. Debe estar en Generado o Rechazado.`
            });
        }

        const tipoAnexo = req.body.tipoAnexo;
        if (!TIPOS_ANEXO.includes(tipoAnexo)) {
            borrarArchivos(archivos);
            return res.status(400).json({ mensaje: 'Seleccione el tipo documental del anexo.' });
        }
        const descripcion = String(req.body.descripcion || '').trim();

        // A1: el contenido real de cada archivo debe corresponder a un formato permitido
        for (const archivo of archivos) {
            if (!(await firmaAnexoValida(archivo.path, archivo.mimetype))) {
                borrarArchivos(archivos);
                return res.status(400).json({
                    mensaje: `El archivo "${archivo.originalname}" no corresponde a un formato permitido (PDF, PNG, JPG, DOCX o XLSX).`
                });
            }
        }

        for (const archivo of archivos) {
            creados.push(await Anexo.create({
                documento: documento._id,
                nombreOriginal: archivo.originalname,
                rutaArchivo: archivo.path,
                tamanoBytes: archivo.size,
                hashArchivo: await hashArchivo(archivo.path),
                tipoAnexo,
                descripcion,
                creadoPor: quienHizo(req.usuario)
            }));
        }

        await registrarAccion({
            accion: 'ANEXO_AGREGADO',
            documento: documento._id,
            codigoTramite: documento.codigoTramite,
            usuario: req.usuario,
            detalle: creados.map((a) => `${a.nombreOriginal} [${a.tipoAnexo}] SHA-256 ${a.hashArchivo}`).join(' | ')
        });

        res.status(201).json({
            mensaje: `${creados.length} anexo(s) cargado(s) con su hash SHA-256.`,
            anexos: creados.map(presentarAnexo)
        });

    } catch (error) {
        // Si algo falla a medias, no queda ningún anexo ni archivo huérfano
        if (creados.length > 0) {
            await Anexo.deleteMany({ _id: { $in: creados.map((a) => a._id) } });
        }
        borrarArchivos(archivos);

        if (error.name === 'ValidationError') {
            return res.status(400).json({ mensaje: error.message });
        }
        console.error('Error al cargar anexos:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor al cargar los anexos.' });
    }
};

// Ver o descargar un anexo (también se comprueba su integridad antes de entregarlo)
const descargarAnexo = async (req, res) => {
    try {
        const documento = await cargarDocumentoAccesible(req, res);
        if (!documento) return;

        if (!idValido(req.params.anexoId)) {
            return res.status(404).json({ mensaje: 'Anexo no encontrado.' });
        }
        const anexo = await Anexo.findOne({ _id: req.params.anexoId, documento: documento._id });
        if (!anexo) {
            return res.status(404).json({ mensaje: 'Anexo no encontrado.' });
        }

        if (documento.bloqueado && !req.usuario.permisos.includes('integridad.verificar')) {
            return res.status(423).json({ mensaje: 'El documento está bloqueado por una alerta de alteración.' });
        }

        const [resultado] = await verificarAnexos([anexo]);
        if (!resultado.coincide) {
            await gestionarAlteracion(documento, { anexos: [resultado] }, req.usuario);
            return res.status(409).json({
                mensaje: 'ALERTA: el anexo no coincide con su hash SHA-256 registrado. El documento fue bloqueado.'
            });
        }

        const verEnPantalla = req.query.modo === 'ver';
        await registrarAccion({
            accion: verEnPantalla ? 'CONSULTA_DOCUMENTO' : 'DESCARGA_DOCUMENTO',
            documento: documento._id,
            codigoTramite: documento.codigoTramite,
            usuario: req.usuario,
            detalle: `Anexo: ${anexo.nombreOriginal}`
        });

        const rutaAbsoluta = path.resolve(anexo.rutaArchivo);

        if (verEnPantalla) {
            res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(anexo.nombreOriginal)}`);
            return res.sendFile(rutaAbsoluta);
        }

        res.download(rutaAbsoluta, anexo.nombreOriginal, (err) => {
            if (err && !res.headersSent) {
                res.status(500).json({ mensaje: 'No se pudo enviar el archivo.' });
            }
        });

    } catch (error) {
        console.error('Error al descargar el anexo:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
};

// ---------- CU-20 y CU-21: Verificar integridad ----------

const verificarIntegridad = async (req, res) => {
    try {
        const documento = await cargarDocumentoAccesible(req, res);
        if (!documento) return;

        const resultado = await verificarDocumento(documento, req.usuario);

        let mensaje;
        if (resultado.sinHash) {
            mensaje = 'No es posible verificar: el documento no tiene hash registrado.';
        } else if (resultado.valido) {
            mensaje = 'Integridad verificada: todas las versiones y anexos coinciden con su hash SHA-256 registrado.';
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
            versiones: resultado.versiones,
            anexos: resultado.anexos
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

        const documento = await cargarDocumentoAccesible(req, res);
        if (!documento) return;

        if (!documento.bloqueado) {
            return res.status(400).json({ mensaje: 'El documento no está bloqueado.' });
        }

        const [versiones, anexos] = await Promise.all([
            Version.find({ documento: documento._id }).sort({ numero: 1 }),
            Anexo.find({ documento: documento._id }).sort({ createdAt: 1 })
        ]);
        const resultadosVersiones = await verificarVersiones(versiones);
        const resultadosAnexos = await verificarAnexos(anexos);

        if (![...resultadosVersiones, ...resultadosAnexos].every((r) => r.coincide)) {
            return res.status(409).json({
                mensaje: 'No se puede desbloquear: el documento sigue alterado.',
                versiones: resultadosVersiones,
                anexos: resultadosAnexos
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

        res.json({ mensaje: 'Documento desbloqueado.', documento: presentar(documento, req.usuario) });

    } catch (error) {
        console.error('Error al desbloquear:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
};

module.exports = {
    crearDocumento,
    obtenerDocumentos,
    obtenerDocumento,
    modificarDocumento,
    cambiarEstado,
    listarVersiones,
    crearVersion,
    descargarVersion,
    listarAnexos,
    subirAnexos,
    descargarAnexo,
    verificarIntegridad,
    desbloquearDocumento
};