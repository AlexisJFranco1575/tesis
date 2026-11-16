const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const Documento = require('../models/Documento');
const Version = require('../models/Version');
const Anexo = require('../models/Anexo');
const Contador = require('../models/Contador');
const Movimiento = require('../models/Movimiento');
const Usuario = require('../models/Usuario');
const { hashArchivo } = require('../utils/hash.service');
const { esParticipante, transicionesPara } = require('../utils/acceso');
const { idValido, cargarDocumentoAccesible } = require('../utils/documentoAcceso');
const { ESTADOS, TRANSICIONES, ESTADOS_EDITABLES } = require('../config/flujo');
const {
    TIPOS_DOCUMENTO,
    TIPOS_ANEXO,
    PRIORIDADES,
    LIMITE_CUERPO,
    requiereAprobacion
} = require('../config/clasificacion');
const { registrarAccion } = require('../services/bitacora.service');
const { notificarFlujo } = require('../services/notificacion.service');
const { resolverArea } = require('../services/catalogo.service');
const { generarNumeroDocumento } = require('../services/numeracion.service');
const { generarPdfDocumento } = require('../services/pdf.service');
const tramiteServicio = require('../services/tramite.service');
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

// Firmas de los formatos permitidos (se comprueba el contenido, no solo la extensión)
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // DOCX y XLSX son archivos ZIP
const FIRMAS = {
    'application/pdf': Buffer.from('%PDF-', 'latin1'),
    'image/png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    'image/jpeg': Buffer.from([0xff, 0xd8, 0xff]),
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ZIP,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ZIP
};

const firmaValida = async (ruta, mimetype) => {
    const firma = FIRMAS[mimetype];
    if (!firma) {
        return false;
    }
    const cabecera = await leerCabecera(ruta, firma.length);
    return cabecera.length === firma.length && cabecera.equals(firma);
};

const mensajeFirmaInvalida = (mimetype) =>
    mimetype === 'application/pdf'
        ? 'El archivo no es un PDF válido.'
        : 'El archivo no corresponde al formato indicado (Word o Excel).';

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

const parsearFecha = (valor) => {
    if (!valor) {
        return null;
    }
    const fecha = new Date(valor);
    return Number.isNaN(fecha.getTime()) ? null : fecha;
};

// El plazo vence al terminar el día indicado (hora de Ecuador, UTC-5)
const parsearPlazo = (valor) => {
    if (!valor) {
        return null;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(valor))) {
        return parsearFecha(`${valor}T23:59:59-05:00`);
    }
    return parsearFecha(valor);
};

const soloFecha = (fecha) => (fecha ? new Date(fecha).toISOString().slice(0, 10) : '');

// Fecha de hoy en Ecuador (UTC-5), formato AAAA-MM-DD
const hoyEcuador = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);

const esVerdadero = (valor) => valor === true || valor === 'true';

const quienHizo = (usuario) => ({ id: String(usuario.id), nombre: usuario.nombreCompleto });

const limpiarCuerpo = (valor) => String(valor || '').replace(/\r\n/g, '\n').replace(/\u0000/g, '').trim();

const errorDeCuerpo = (cuerpo) => {
    if (cuerpo.length < 10) {
        return 'Escriba el contenido del documento (mínimo 10 caracteres).';
    }
    if (cuerpo.length > LIMITE_CUERPO) {
        return `El contenido supera el máximo de ${LIMITE_CUERPO} caracteres.`;
    }
    return null;
};

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

// Ruta nueva para un PDF generado por el sistema
const generarRutaPdf = () => {
    const carpeta = process.env.UPLOADS_DIR || './uploads';
    fs.mkdirSync(carpeta, { recursive: true });
    return path.join(carpeta, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.pdf`);
};

const nombreArchivoPdf = (numero) => `${String(numero).replace(/[^A-Za-z0-9_-]/g, '_')}.pdf`;

// Destinatario principal: una persona del directorio, o un área del catálogo
const resolverDestinatario = async (entrada) => {
    if (!entrada || typeof entrada !== 'object') {
        return { error: 'Indique el destinatario del documento.' };
    }

    if (entrada.usuario) {
        if (!mongoose.isValidObjectId(entrada.usuario)) {
            return { error: 'El destinatario no es válido.' };
        }
        const persona = await Usuario.findOne({ _id: entrada.usuario, estado: true });
        if (!persona) {
            return { error: 'El destinatario no existe o está inactivo.' };
        }
        return {
            valor: { nombre: `${persona.nombres} ${persona.apellidos}`, departamento: persona.departamento, usuario: String(persona._id) }
        };
    }

    const area = await resolverArea(entrada.departamento);
    if (!area) {
        return { error: 'Seleccione el área del destinatario de la lista.' };
    }
    const nombre = typeof entrada.nombre === 'string' && entrada.nombre.trim() ? entrada.nombre.trim() : area.nombre;
    return { valor: { nombre, departamento: area.nombre, usuario: '' } };
};

// Por qué un documento no se puede enviar todavía (null si puede enviarse)
const motivoNoEnviable = (documento) => {
    if (documento.estado === 'Generado' && requiereAprobacion(documento.tipoDocumento)) {
        return `Un documento de tipo ${documento.tipoDocumento} debe ser aprobado por Gerencia antes de enviarse. Envíelo primero a revisión.`;
    }
    if (documento.estado === 'Generado' || documento.estado === 'Aprobado') {
        return null;
    }
    return `Un documento en estado "${documento.estado}" no puede enviarse.`;
};

// Qué acciones de edición y envío están disponibles para el usuario sobre el documento
const accionesPara = (documento, usuario) => {
    const editable = !documento.bloqueado && ESTADOS_EDITABLES.includes(documento.estado);
    return {
        modificar: editable && usuario.permisos.includes('documentos.modificar'),
        versionar: editable && usuario.permisos.includes('documentos.versionar'),
        anexar: editable && usuario.permisos.includes('documentos.anexar'),
        editarContenido: editable && documento.origen === 'redactado' && usuario.permisos.includes('documentos.versionar'),
        enviar: !documento.bloqueado && motivoNoEnviable(documento) === null && usuario.permisos.includes('documentos.enviar')
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

const buscarReferencia = async (id) => {
    if (!id) {
        return null;
    }
    const original = await Documento.findById(id).select('codigoTramite asunto').lean();
    return original ? { codigoTramite: original.codigoTramite, asunto: original.asunto } : null;
};

// ---------- Validación común del registro (documento cargado o redactado) ----------
// Devuelve { datos, numeroManual } o null si ya respondió con el error.

const prepararDatos = async (req, res) => {
    const b = req.body || {};
    const tipoDocumento = b.tipoDocumento;
    const asunto = String(b.asunto || '').trim();
    const motivo = String(b.motivo || '').trim();
    const observacion = String(b.observacion || '').trim();
    const prioridad = b.prioridad || 'Normal';
    const confidencial = esVerdadero(b.confidencial);
    const entradaDestinatario = leerObjeto(b.destinatario);
    const numeroManual = String(b.numeroOficio || '').trim().toUpperCase();

    // A1: datos obligatorios (la fecha, si no se indica, es la de hoy)
    if (!tipoDocumento || !asunto || !motivo || !entradaDestinatario) {
        res.status(400).json({ mensaje: 'Faltan datos obligatorios: tipo, asunto, motivo y destinatario.' });
        return null;
    }
    if (b.fechaOficio && !parsearFecha(b.fechaOficio)) {
        res.status(400).json({ mensaje: 'La fecha del documento no es válida.' });
        return null;
    }
    if (!TIPOS_DOCUMENTO.includes(tipoDocumento)) {
        res.status(400).json({ mensaje: 'El tipo de documento no es válido.' });
        return null;
    }
    if (!PRIORIDADES.includes(prioridad)) {
        res.status(400).json({ mensaje: 'La prioridad indicada no es válida.' });
        return null;
    }

    const destinatario = await resolverDestinatario(entradaDestinatario);
    if (destinatario.error) {
        res.status(400).json({ mensaje: destinatario.error });
        return null;
    }

    // Documento al que este responde (opcional): el usuario debe tener acceso a él
    let referencia = null;
    if (b.referencia) {
        const original = idValido(b.referencia) ? await Documento.findById(b.referencia) : null;
        if (!original || !esParticipante(req.usuario, original)) {
            res.status(400).json({ mensaje: 'El documento de referencia no existe o no tiene acceso a él.' });
            return null;
        }
        referencia = original._id;
    }

    // A2: un número escrito a mano no puede repetirse
    if (numeroManual && (await Documento.exists({ numeroOficio: numeroManual }))) {
        res.status(409).json({ mensaje: 'Ya existe un documento registrado con ese número.' });
        return null;
    }

    return {
        numeroManual,
        datos: {
            fechaOficio: parsearFecha(b.fechaOficio || hoyEcuador()),
            tipoDocumento,
            asunto,
            motivo,
            observacion,
            prioridad,
            confidencial,
            fechaLimite: parsearPlazo(b.fechaLimite),
            referencia,
            destinatario: destinatario.valor
        }
    };
};

// Número escrito a mano, o generado automáticamente por área, tipo y año
const asignarNumero = async (req, preparado) => {
    const { datos, numeroManual } = preparado;
    datos.numeroOficio =
        numeroManual ||
        (await generarNumeroDocumento({
            tipoDocumento: datos.tipoDocumento,
            areaNombre: req.usuario.departamento,
            fecha: datos.fechaOficio
        }));
};

// Crea el documento, su versión 1, el primer movimiento del recorrido y la bitácora.
// Si algo falla a medias, deshace el registro para no dejar datos huérfanos.
const guardarDocumento = async (req, datos, archivo, codigoTramite) => {
    const hash = await hashArchivo(archivo.path);
    const creadoPor = quienHizo(req.usuario);
    let documento;

    try {
        documento = await Documento.create({
            codigoTramite: codigoTramite || (await generarCodigoTramite()),
            ...datos,
            remitente: { nombre: req.usuario.nombreCompleto, departamento: req.usuario.departamento },
            involucrados: [req.usuario.id],
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

        await Movimiento.create({
            documento: documento._id,
            tipo: 'ELABORACION',
            de: tramiteServicio.personaDeSesion(req.usuario),
            comentario: documento.origen === 'redactado' ? 'Documento redactado en el sistema' : 'Documento elaborado'
        });

        await registrarAccion({
            accion: 'REGISTRO_DOCUMENTO',
            documento: documento._id,
            codigoTramite: documento.codigoTramite,
            usuario: req.usuario,
            detalle: `${documento.tipoDocumento} ${documento.numeroOficio} · ${documento.origen === 'redactado' ? 'redactado en el sistema' : 'archivo cargado'} · Versión 1 · SHA-256 ${hash}`
        });
    } catch (error) {
        if (documento) {
            await Documento.deleteOne({ _id: documento._id });
            await Version.collection.deleteMany({ documento: documento._id });
            await Movimiento.deleteMany({ documento: documento._id });
        }
        throw error;
    }

    return documento;
};

const responderErrorRegistro = (error, res, contexto) => {
    if (error.code === 11000) {
        const campo = error.keyPattern?.numeroOficio ? 'ese número' : 'ese código';
        return res.status(409).json({ mensaje: `Ya existe un documento con ${campo}.` });
    }
    if (error.name === 'ValidationError') {
        return res.status(400).json({ mensaje: error.message });
    }
    console.error(`Error al ${contexto}:`, error);
    return res.status(500).json({ mensaje: 'Error interno del servidor al procesar el documento.' });
};

// Genera una nueva versión del PDF de un documento redactado con sus datos y contenido actuales,
// la guarda con su hash y actualiza el documento. Devuelve el número de versión.
const generarNuevaVersionPdf = async (documento, usuario, comentario) => {
    const numero = documento.versionActual + 1;
    const ruta = generarRutaPdf();

    try {
        await generarPdfDocumento(ruta, {
            tipoDocumento: documento.tipoDocumento,
            numero: documento.numeroOficio,
            codigoTramite: documento.codigoTramite,
            fecha: documento.fechaOficio || documento.createdAt,
            remitente: { nombre: documento.remitente.nombre, departamento: documento.remitente.departamento },
            destinatario: { nombre: documento.destinatario.nombre, departamento: documento.destinatario.departamento },
            asunto: documento.asunto,
            cuerpo: documento.cuerpo,
            referencia: await buscarReferencia(documento.referencia),
            prioridad: documento.prioridad,
            confidencial: documento.confidencial
        });

        const hash = await hashArchivo(ruta);
        const { size } = await fs.promises.stat(ruta);

        await Version.create({
            documento: documento._id,
            numero,
            nombreOriginal: nombreArchivoPdf(documento.numeroOficio || documento.codigoTramite),
            rutaArchivo: ruta,
            tamanoBytes: size,
            hashArchivo: hash,
            comentario,
            creadoPor: quienHizo(usuario)
        });

        documento.versionActual = numero;
        documento.hashActual = hash;
        await documento.save();

        await registrarAccion({
            accion: 'NUEVA_VERSION',
            documento: documento._id,
            codigoTramite: documento.codigoTramite,
            usuario,
            detalle: `Versión ${numero} · SHA-256 ${hash} · ${comentario}`
        });
    } catch (error) {
        borrarArchivo(ruta);
        throw error;
    }

    return numero;
};

// ---------- CU-08: Registrar documento con un archivo ya elaborado (incluye CU-09, CU-10 y CU-19) ----------
// El remitente es siempre el usuario con sesión iniciada y su área.

const crearDocumento = async (req, res) => {
    const archivo = req.file;

    try {
        if (!archivo) {
            return res.status(400).json({ mensaje: 'Debe adjuntar el archivo del documento (PDF, Word o Excel).' });
        }

        const preparado = await prepararDatos(req, res);
        if (!preparado) {
            borrarArchivo(archivo.path);
            return;
        }

        // A3: el contenido real del archivo debe corresponder a su formato
        if (!(await firmaValida(archivo.path, archivo.mimetype))) {
            borrarArchivo(archivo.path);
            return res.status(400).json({ mensaje: mensajeFirmaInvalida(archivo.mimetype) });
        }

        await asignarNumero(req, preparado);
        preparado.datos.origen = 'cargado';

        const documento = await guardarDocumento(req, preparado.datos, archivo);

        res.status(201).json({
            mensaje: `Documento registrado con el código ${documento.codigoTramite} y su hash SHA-256.`,
            documento
        });

    } catch (error) {
        borrarArchivo(archivo?.path);
        responderErrorRegistro(error, res, 'crear documento');
    }
};

// ---------- Redactar un documento en el sistema ----------
// El usuario escribe el contenido y el sistema genera el PDF con el formato institucional.

const redactarDocumento = async (req, res) => {
    let ruta = null;

    try {
        const preparado = await prepararDatos(req, res);
        if (!preparado) {
            return;
        }

        const cuerpo = limpiarCuerpo(req.body?.cuerpo);
        const errorCuerpo = errorDeCuerpo(cuerpo);
        if (errorCuerpo) {
            return res.status(400).json({ mensaje: errorCuerpo });
        }

        await asignarNumero(req, preparado);
        const { datos } = preparado;
        datos.cuerpo = cuerpo;
        datos.origen = 'redactado';

        const codigoTramite = await generarCodigoTramite();
        ruta = generarRutaPdf();

        await generarPdfDocumento(ruta, {
            tipoDocumento: datos.tipoDocumento,
            numero: datos.numeroOficio,
            codigoTramite,
            fecha: datos.fechaOficio,
            remitente: { nombre: req.usuario.nombreCompleto, departamento: req.usuario.departamento },
            destinatario: { nombre: datos.destinatario.nombre, departamento: datos.destinatario.departamento },
            asunto: datos.asunto,
            cuerpo,
            referencia: await buscarReferencia(datos.referencia),
            prioridad: datos.prioridad,
            confidencial: datos.confidencial
        });

        const { size } = await fs.promises.stat(ruta);
        const documento = await guardarDocumento(
            req,
            datos,
            { path: ruta, originalname: nombreArchivoPdf(datos.numeroOficio), size },
            codigoTramite
        );

        res.status(201).json({
            mensaje: `Documento ${documento.numeroOficio} generado con el código ${documento.codigoTramite} y su hash SHA-256.`,
            documento
        });

    } catch (error) {
        borrarArchivo(ruta);
        responderErrorRegistro(error, res, 'redactar el documento');
    }
};

// ---------- Editar el contenido de un documento redactado ----------
// Genera una nueva versión del PDF; la anterior se conserva.

const editarContenido = async (req, res) => {
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
        if (documento.origen !== 'redactado') {
            return res.status(409).json({
                mensaje: 'Este documento se cargó como archivo. Para cambiar su contenido cree una nueva versión con el archivo corregido.'
            });
        }

        const cuerpo = limpiarCuerpo(req.body?.cuerpo);
        const errorCuerpo = errorDeCuerpo(cuerpo);
        if (errorCuerpo) {
            return res.status(400).json({ mensaje: errorCuerpo });
        }
        if (cuerpo === documento.cuerpo) {
            return res.status(400).json({ mensaje: 'No hay cambios en el contenido.' });
        }

        const comentario = String(req.body?.comentario || '').trim() || 'Contenido editado';
        documento.cuerpo = cuerpo;
        const numero = await generarNuevaVersionPdf(documento, req.usuario, comentario);

        res.json({
            mensaje: `Contenido actualizado. Se generó la versión ${numero} con su hash SHA-256.`,
            documento: presentar(documento, req.usuario)
        });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ mensaje: 'Se registró otra versión al mismo tiempo. Intente nuevamente.' });
        }
        console.error('Error al editar el contenido:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
};

// ---------- Consultas ----------

// Cada usuario ve únicamente los documentos en los que participa
const obtenerDocumentos = async (req, res) => {
    try {
        const documentos = await Documento.find().select('-cuerpo').sort({ createdAt: -1 });
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

        // Documento al que responde, solo si el usuario también tiene acceso a él
        let referenciaDocumento = null;
        if (documento.referencia) {
            const original = await Documento.findById(documento.referencia)
                .select('codigoTramite asunto creadoPor remitente destinatario involucrados confidencial')
                .lean();
            if (original && esParticipante(req.usuario, original)) {
                referenciaDocumento = { _id: original._id, codigoTramite: original.codigoTramite, asunto: original.asunto };
            }
        }

        res.json({ ...presentar(documento, req.usuario), referenciaDocumento });
    } catch (error) {
        console.error('Error al obtener el documento:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
};

// ---------- CU-14: Modificar documento ----------
// Se pueden modificar asunto, tipo, fecha, motivo, observación y destinatario.
// El número y el código no cambian. Lo anterior queda en la bitácora.
// Si el documento fue redactado en el sistema y cambian datos que aparecen en el PDF, se genera una nueva versión.

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
        let cambiaPdf = false;
        const { asunto, tipoDocumento, motivo, observacion, fechaOficio } = req.body || {};
        const entradaDestinatario = leerObjeto(req.body?.destinatario);

        if (asunto !== undefined) {
            const nuevo = String(asunto).trim();
            if (!nuevo) {
                return res.status(400).json({ mensaje: 'El asunto no puede quedar vacío.' });
            }
            if (nuevo !== documento.asunto) {
                cambios.push(`asunto: "${documento.asunto}" → "${nuevo}"`);
                documento.asunto = nuevo;
                cambiaPdf = true;
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
                cambiaPdf = true;
            }
        }

        if (tipoDocumento !== undefined && tipoDocumento !== documento.tipoDocumento) {
            cambios.push(`tipo: "${documento.tipoDocumento}" → "${tipoDocumento}"`);
            documento.tipoDocumento = tipoDocumento;
            cambiaPdf = true;
        }

        if (entradaDestinatario) {
            const resuelto = await resolverDestinatario(entradaDestinatario);
            if (resuelto.error) {
                return res.status(400).json({ mensaje: resuelto.error });
            }
            const nuevo = resuelto.valor;
            const actual = documento.destinatario;
            if (nuevo.nombre !== actual.nombre || nuevo.departamento !== actual.departamento) {
                cambios.push(`destinatario: "${actual.nombre} (${actual.departamento})" → "${nuevo.nombre} (${nuevo.departamento})"`);
                documento.destinatario = nuevo;
                cambiaPdf = true;
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

        // El PDF de un documento redactado debe reflejar los datos nuevos: se genera otra versión
        let versionNueva = null;
        if (cambiaPdf && documento.origen === 'redactado') {
            versionNueva = await generarNuevaVersionPdf(documento, req.usuario, 'Actualización automática por cambio de datos');
        }

        res.json({
            mensaje: versionNueva
                ? `Documento actualizado. Se generó la versión ${versionNueva} del PDF con los datos nuevos.`
                : 'Documento actualizado. Los datos anteriores quedaron en la trazabilidad.',
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

        // "Distribuido" se alcanza al enviar el documento, indicando sus destinatarios
        if (nuevo === 'Distribuido') {
            return res.status(409).json({
                mensaje: 'Para distribuir un documento use la acción Enviar: allí se indican los destinatarios.'
            });
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

// ---------- Enviar el documento (Para, Con copia, plazo, prioridad y confidencialidad) ----------

const enviarDocumento = async (req, res) => {
    try {
        const documento = await cargarDocumentoAccesible(req, res);
        if (!documento) return;

        if (documento.bloqueado) {
            return res.status(423).json({ mensaje: 'El documento está bloqueado por una alerta de alteración.' });
        }
        const motivoNo = motivoNoEnviable(documento);
        if (motivoNo) {
            return res.status(409).json({ mensaje: motivoNo });
        }

        const prioridad = req.body?.prioridad;
        if (prioridad !== undefined && !PRIORIDADES.includes(prioridad)) {
            return res.status(400).json({ mensaje: 'La prioridad indicada no es válida.' });
        }

        const fechaLimite = parsearPlazo(req.body?.fechaLimite);
        if (req.body?.fechaLimite && !fechaLimite) {
            return res.status(400).json({ mensaje: 'El plazo no es válido.' });
        }
        if (fechaLimite && fechaLimite.getTime() < Date.now()) {
            return res.status(400).json({ mensaje: 'El plazo no puede estar en el pasado.' });
        }

        const confidencial = typeof req.body?.confidencial === 'boolean' ? req.body.confidencial : undefined;
        const comentario = String(req.body?.comentario || '').trim().slice(0, 500);

        const resultado = await tramiteServicio.enviar({
            documento,
            actor: req.usuario,
            para: req.body?.para,
            copia: req.body?.copia,
            comentario,
            fechaLimite,
            prioridad,
            confidencial
        });

        res.json({
            mensaje: `Documento enviado a ${resultado.totalPara} destinatario(s)${resultado.totalCopia ? ` y ${resultado.totalCopia} con copia` : ''}.`,
            documento: presentar(documento, req.usuario)
        });

    } catch (error) {
        if (error instanceof tramiteServicio.ErrorTramite) {
            return res.status(error.estado).json({ mensaje: error.message });
        }
        console.error('Error al enviar el documento:', error);
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

// ---------- CU-16: Crear nueva versión con un archivo (incluye CU-19) ----------

const crearVersion = async (req, res) => {
    const archivo = req.file;

    try {
        if (!archivo) {
            return res.status(400).json({ mensaje: 'Debe adjuntar el archivo de la nueva versión (PDF, Word o Excel).' });
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
        if (!(await firmaValida(archivo.path, archivo.mimetype))) {
            borrarArchivo(archivo.path);
            return res.status(400).json({ mensaje: mensajeFirmaInvalida(archivo.mimetype) });
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
        // Si la versión vigente es un archivo subido, el documento deja de editarse desde el redactor
        documento.origen = 'cargado';
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
            if (!(await firmaValida(archivo.path, archivo.mimetype))) {
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
// Alcanza también a los documentos confidenciales: solo se muestran hashes, nunca el contenido.

const verificarIntegridad = async (req, res) => {
    try {
        const documento = await cargarDocumentoAccesible(req, res, { paraIntegridad: true });
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

        const documento = await cargarDocumentoAccesible(req, res, { paraIntegridad: true });
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
    redactarDocumento,
    editarContenido,
    obtenerDocumentos,
    obtenerDocumento,
    modificarDocumento,
    cambiarEstado,
    enviarDocumento,
    listarVersiones,
    crearVersion,
    descargarVersion,
    listarAnexos,
    subirAnexos,
    descargarAnexo,
    verificarIntegridad,
    desbloquearDocumento
};