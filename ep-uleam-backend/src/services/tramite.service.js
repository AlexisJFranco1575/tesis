const mongoose = require('mongoose');
const Documento = require('../models/Documento');
const Usuario = require('../models/Usuario');
const Tramite = require('../models/Tramite');
const Movimiento = require('../models/Movimiento');
const Notificacion = require('../models/Notificacion');
const { registrarAccion } = require('./bitacora.service');
const { normalizar } = require('../utils/acceso');

// Error con el código HTTP que debe recibir quien hizo la petición
class ErrorTramite extends Error {
    constructor(estado, mensaje) {
        super(mensaje);
        this.estado = estado;
    }
}

const ESTADOS_ACTIVOS = ['pendiente', 'leido', 'respondido'];
const ESTADOS_ATENDIBLES = ['pendiente', 'leido'];

const BANDEJAS = ['elaboracion', 'recibidos', 'enviados', 'informados', 'reasignados', 'archivados'];
const ESTADOS_ELABORACION = ['Generado', 'En Revisión', 'Rechazado', 'Aprobado'];
const ESTADOS_ENVIADOS = ['Distribuido', 'Archivado'];

const FILTROS = {
    recibidos: { tipo: 'para', estado: { $in: ESTADOS_ACTIVOS } },
    informados: { tipo: { $in: ['copia', 'informado'] }, estado: { $in: ESTADOS_ATENDIBLES } },
    reasignados: { estado: 'reasignado' },
    archivados: { estado: 'archivado' }
};

// ---------- Utilidades ----------

const nombreDe = (u) => `${u.nombres} ${u.apellidos}`;
const personaDeUsuario = (u) => ({ id: String(u._id), nombre: nombreDe(u), departamento: u.departamento });
const personaDeSesion = (s) => ({ id: s.id, nombre: s.nombreCompleto, departamento: s.departamento });
const unicos = (lista) => [...new Set((Array.isArray(lista) ? lista : []).map(String))];
const fechaCorta = (fecha) => new Date(fecha).toISOString().slice(0, 10);

// Carga a los destinatarios (deben existir y estar activos), conservando el orden recibido
const cargarUsuarios = async (ids) => {
    if (ids.some((id) => !mongoose.isValidObjectId(id))) {
        throw new ErrorTramite(400, 'Alguno de los destinatarios no es válido.');
    }
    const usuarios = await Usuario.find({ _id: { $in: ids }, estado: true });
    if (usuarios.length !== ids.length) {
        throw new ErrorTramite(400, 'Alguno de los destinatarios no existe o está inactivo.');
    }
    const porId = new Map(usuarios.map((u) => [String(u._id), u]));
    return ids.map((id) => porId.get(id));
};

const registrarMovimiento = (documento, tipo, de, para = [], comentario = '') =>
    Movimiento.create({ documento: documento._id, tipo, de, para, comentario });

// Las notificaciones nunca deben impedir que el trámite se complete
const avisar = async (usuarios, documento, { titulo, mensaje, tipo = 'FLUJO' }) => {
    if (usuarios.length === 0) {
        return;
    }
    try {
        await Notificacion.insertMany(
            usuarios.map((u) => ({
                usuario: u._id,
                tipo,
                titulo,
                mensaje,
                documento: documento._id,
                codigoTramite: documento.codigoTramite
            }))
        );
    } catch (error) {
        console.error('Error al generar notificaciones del trámite:', error.message);
    }
};

const resumenDe = (documento) => `${documento.codigoTramite} (${documento.asunto})`;

// ---------- Enviar ----------

const enviar = async ({ documento, actor, para, copia = [], comentario = '', fechaLimite = null, prioridad, confidencial }) => {
    const idsPara = unicos(para).filter((id) => id !== actor.id);
    const idsCopia = unicos(copia).filter((id) => id !== actor.id && !idsPara.includes(id));

    if (idsPara.length === 0) {
        throw new ErrorTramite(400, 'Indique al menos un destinatario en "Para" (distinto de usted).');
    }

    const usuarios = await cargarUsuarios([...idsPara, ...idsCopia]);
    const destinatariosPara = usuarios.slice(0, idsPara.length);
    const destinatariosCopia = usuarios.slice(idsPara.length);
    const de = personaDeSesion(actor);

    await Tramite.insertMany([
        ...destinatariosPara.map((u) => ({ documento: documento._id, usuario: u._id, tipo: 'para', de, comentario, fechaLimite })),
        ...destinatariosCopia.map((u) => ({ documento: documento._id, usuario: u._id, tipo: 'copia', de, comentario }))
    ]);

    // El documento pasa a "Distribuido"; su destinatario principal es el primer "Para"
    const principal = destinatariosPara[0];
    documento.estado = 'Distribuido';
    documento.enviadoEn = new Date();
    documento.destinatario = { nombre: nombreDe(principal), departamento: principal.departamento, usuario: String(principal._id) };
    if (prioridad) documento.prioridad = prioridad;
    if (typeof confidencial === 'boolean') documento.confidencial = confidencial;
    documento.fechaLimite = fechaLimite;
    documento.involucrados = unicos([
        ...documento.involucrados,
        documento.creadoPor.id,
        actor.id,
        ...idsPara,
        ...idsCopia
    ]);
    await documento.save();

    const nombresPara = destinatariosPara.map(nombreDe).join(', ');
    const nombresCopia = destinatariosCopia.map(nombreDe).join(', ');

    await registrarMovimiento(documento, 'ENVIO', de, [...destinatariosPara, ...destinatariosCopia].map(personaDeUsuario), comentario);
    await registrarAccion({
        accion: 'DOCUMENTO_ENVIADO',
        documento: documento._id,
        codigoTramite: documento.codigoTramite,
        usuario: actor,
        detalle: `Para: ${nombresPara}${nombresCopia ? ` · Copia: ${nombresCopia}` : ''} · Prioridad: ${documento.prioridad}${fechaLimite ? ` · Plazo: ${fechaCorta(fechaLimite)}` : ''}${documento.confidencial ? ' · Confidencial' : ''}`
    });

    const urgente = documento.prioridad === 'Urgente';
    const plazo = fechaLimite ? ` Plazo: ${fechaCorta(fechaLimite)}.` : '';

    await avisar(destinatariosPara, documento, {
        titulo: 'Nuevo documento recibido',
        mensaje: `${actor.nombreCompleto} le envió el documento ${resumenDe(documento)}${urgente ? ' · URGENTE' : ''}.${plazo}`,
        tipo: urgente ? 'ALERTA' : 'FLUJO'
    });
    await avisar(destinatariosCopia, documento, {
        titulo: 'Documento recibido con copia',
        mensaje: `${actor.nombreCompleto} le envió con copia el documento ${resumenDe(documento)}.`,
        tipo: 'INFO'
    });

    if (documento.referencia) {
        await registrarRespuesta(documento, actor);
    }

    return { totalPara: destinatariosPara.length, totalCopia: destinatariosCopia.length };
};

// Si el documento enviado responde a otro que el remitente había recibido, ese queda como "respondido"
const registrarRespuesta = async (documento, actor) => {
    const original = await Documento.findById(documento.referencia);
    if (!original) {
        return;
    }
    const tramite = await Tramite.findOne({
        documento: original._id,
        usuario: actor.id,
        tipo: 'para',
        estado: { $in: ESTADOS_ATENDIBLES }
    });
    if (!tramite) {
        return;
    }

    tramite.estado = 'respondido';
    await tramite.save();

    await registrarMovimiento(original, 'RESPUESTA', personaDeSesion(actor), [], `Respondido con el documento ${documento.codigoTramite}`);
    await registrarAccion({
        accion: 'DOCUMENTO_RESPONDIDO',
        documento: original._id,
        codigoTramite: original.codigoTramite,
        usuario: actor,
        detalle: `Respondido con ${documento.codigoTramite}`
    });
};

// ---------- Leer (acuse de lectura) ----------

const leer = async (tramite, actor) => {
    if (tramite.estado !== 'pendiente') {
        return tramite; // ya estaba leído: no se repite el acuse
    }

    const documento = await Documento.findById(tramite.documento);
    tramite.estado = 'leido';
    tramite.fechaLectura = new Date();
    await tramite.save();

    if (documento) {
        await registrarMovimiento(documento, 'LECTURA', personaDeSesion(actor));
        await registrarAccion({
            accion: 'DOCUMENTO_LEIDO',
            documento: documento._id,
            codigoTramite: documento.codigoTramite,
            usuario: actor,
            detalle: ''
        });
    }
    return tramite;
};

// ---------- Reasignar ----------

const reasignar = async (tramite, actor, { usuarios, comentario = '', fechaLimite = null }) => {
    if (tramite.tipo !== 'para') {
        throw new ErrorTramite(409, 'Solo se pueden reasignar los documentos recibidos como destinatario principal.');
    }
    if (!ESTADOS_ATENDIBLES.includes(tramite.estado)) {
        throw new ErrorTramite(409, 'Este trámite ya fue atendido (reasignado, respondido o archivado).');
    }

    const documento = await Documento.findById(tramite.documento);
    if (!documento) {
        throw new ErrorTramite(404, 'Documento no encontrado.');
    }
    if (documento.bloqueado) {
        throw new ErrorTramite(423, 'El documento está bloqueado por una alerta de alteración.');
    }

    const ids = unicos(usuarios).filter((id) => id !== actor.id);
    if (ids.length === 0) {
        throw new ErrorTramite(400, 'Seleccione a quién reasignar el documento (distinto de usted).');
    }
    const destinatarios = await cargarUsuarios(ids);

    const yaLoTienen = await Tramite.find({
        documento: documento._id,
        usuario: { $in: ids },
        estado: { $in: ESTADOS_ACTIVOS }
    }).populate('usuario', 'nombres apellidos');
    if (yaLoTienen.length > 0) {
        const nombres = yaLoTienen.map((t) => nombreDe(t.usuario)).join(', ');
        throw new ErrorTramite(409, `${nombres} ya tiene este documento en su bandeja.`);
    }

    const de = personaDeSesion(actor);
    const plazo = fechaLimite || tramite.fechaLimite;

    await Tramite.insertMany(
        destinatarios.map((u) => ({
            documento: documento._id,
            usuario: u._id,
            tipo: 'para',
            de,
            comentario,
            fechaLimite: plazo,
            origen: tramite._id
        }))
    );

    tramite.estado = 'reasignado';
    tramite.reasignadoA = ids;
    if (!tramite.fechaLectura) tramite.fechaLectura = new Date();
    await tramite.save();

    documento.involucrados = unicos([...documento.involucrados, ...ids]);
    await documento.save();

    await registrarMovimiento(documento, 'REASIGNACION', de, destinatarios.map(personaDeUsuario), comentario);
    await registrarAccion({
        accion: 'DOCUMENTO_REASIGNADO',
        documento: documento._id,
        codigoTramite: documento.codigoTramite,
        usuario: actor,
        detalle: `A: ${destinatarios.map(nombreDe).join(', ')}${comentario ? ` · ${comentario}` : ''}`
    });

    await avisar(destinatarios, documento, {
        titulo: 'Documento reasignado',
        mensaje: `${actor.nombreCompleto} le reasignó el documento ${resumenDe(documento)}.${comentario ? ` Indicación: ${comentario}` : ''}`
    });

    return { total: destinatarios.length };
};

// ---------- Informar (copia solo para conocimiento) ----------

const informar = async (tramite, actor, { usuarios, comentario = '' }) => {
    if (!ESTADOS_ACTIVOS.includes(tramite.estado)) {
        throw new ErrorTramite(409, 'Solo puede informar un documento que tiene en sus bandejas activas.');
    }

    const documento = await Documento.findById(tramite.documento);
    if (!documento) {
        throw new ErrorTramite(404, 'Documento no encontrado.');
    }
    if (documento.bloqueado) {
        throw new ErrorTramite(423, 'El documento está bloqueado por una alerta de alteración.');
    }

    const ids = unicos(usuarios).filter((id) => id !== actor.id);
    if (ids.length === 0) {
        throw new ErrorTramite(400, 'Seleccione a quién informar (distinto de usted).');
    }
    const destinatarios = await cargarUsuarios(ids);

    const existentes = await Tramite.find({
        documento: documento._id,
        usuario: { $in: ids },
        estado: { $in: ESTADOS_ACTIVOS }
    }).select('usuario');
    const yaLoTienen = new Set(existentes.map((t) => String(t.usuario)));
    const nuevos = destinatarios.filter((u) => !yaLoTienen.has(String(u._id)));
    if (nuevos.length === 0) {
        throw new ErrorTramite(409, 'Esas personas ya tienen el documento en su bandeja.');
    }

    const de = personaDeSesion(actor);
    await Tramite.insertMany(
        nuevos.map((u) => ({ documento: documento._id, usuario: u._id, tipo: 'informado', de, comentario }))
    );

    documento.involucrados = unicos([...documento.involucrados, ...nuevos.map((u) => String(u._id))]);
    await documento.save();

    await registrarMovimiento(documento, 'INFORME', de, nuevos.map(personaDeUsuario), comentario);
    await registrarAccion({
        accion: 'DOCUMENTO_INFORMADO',
        documento: documento._id,
        codigoTramite: documento.codigoTramite,
        usuario: actor,
        detalle: `A: ${nuevos.map(nombreDe).join(', ')}${comentario ? ` · ${comentario}` : ''}`
    });

    await avisar(nuevos, documento, {
        titulo: 'Documento para su conocimiento',
        mensaje: `${actor.nombreCompleto} le informó del documento ${resumenDe(documento)}.${comentario ? ` Nota: ${comentario}` : ''}`,
        tipo: 'INFO'
    });

    return { total: nuevos.length };
};

// ---------- Archivar y restaurar ----------

const archivar = async (tramite, actor, comentario) => {
    const motivo = String(comentario || '').trim();
    if (motivo.length < 3) {
        throw new ErrorTramite(400, 'Indique el motivo del archivo (mínimo 3 caracteres).');
    }
    if (!ESTADOS_ACTIVOS.includes(tramite.estado)) {
        throw new ErrorTramite(409, 'Este trámite no se puede archivar en su estado actual.');
    }

    const documento = await Documento.findById(tramite.documento);

    tramite.estado = 'archivado';
    tramite.comentarioArchivo = motivo;
    tramite.fechaArchivo = new Date();
    if (!tramite.fechaLectura) tramite.fechaLectura = new Date();
    await tramite.save();

    if (documento) {
        await registrarMovimiento(documento, 'ARCHIVO', personaDeSesion(actor), [], motivo);
        await registrarAccion({
            accion: 'TRAMITE_ARCHIVADO',
            documento: documento._id,
            codigoTramite: documento.codigoTramite,
            usuario: actor,
            detalle: motivo
        });
    }
};

const restaurar = async (tramite, actor) => {
    if (tramite.estado !== 'archivado') {
        throw new ErrorTramite(409, 'Solo se puede restaurar un trámite archivado.');
    }

    const documento = await Documento.findById(tramite.documento);

    tramite.estado = 'leido';
    tramite.comentarioArchivo = '';
    tramite.fechaArchivo = null;
    await tramite.save();

    if (documento) {
        await registrarMovimiento(documento, 'RESTAURACION', personaDeSesion(actor));
        await registrarAccion({
            accion: 'TRAMITE_RESTAURADO',
            documento: documento._id,
            codigoTramite: documento.codigoTramite,
            usuario: actor,
            detalle: ''
        });
    }
};

// ---------- Bandejas ----------

const CAMPOS_DOCUMENTO = 'codigoTramite asunto tipoDocumento prioridad confidencial estado bloqueado remitente';

const filaDeTramite = (t) => {
    const d = t.documento;
    const vencido =
        t.tipo === 'para' && ESTADOS_ATENDIBLES.includes(t.estado) && !!t.fechaLimite && new Date(t.fechaLimite) < new Date();

    return {
        _id: String(t._id),
        tramite: String(t._id),
        documentoId: String(d._id),
        codigoTramite: d.codigoTramite,
        asunto: d.asunto,
        tipoDocumento: d.tipoDocumento,
        prioridad: d.prioridad,
        confidencial: d.confidencial,
        estadoDocumento: d.estado,
        bloqueado: d.bloqueado,
        de: t.de,
        tipo: t.tipo,
        estado: t.estado,
        sinLeer: t.estado === 'pendiente',
        fechaLimite: t.fechaLimite,
        vencido,
        comentario: t.comentario,
        comentarioArchivo: t.comentarioArchivo,
        fecha: t.createdAt
    };
};

// En las bandejas "en elaboración" y "enviados" las filas son los documentos que el usuario creó
const filaDeDocumento = (d) => ({
    _id: String(d._id),
    tramite: null,
    documentoId: String(d._id),
    codigoTramite: d.codigoTramite,
    asunto: d.asunto,
    tipoDocumento: d.tipoDocumento,
    prioridad: d.prioridad,
    confidencial: d.confidencial,
    estadoDocumento: d.estado,
    bloqueado: d.bloqueado,
    de: d.remitente,
    tipo: 'autor',
    estado: d.estado,
    sinLeer: false,
    fechaLimite: d.fechaLimite,
    vencido: false,
    comentario: '',
    comentarioArchivo: '',
    fecha: d.enviadoEn || d.createdAt
});

const listarBandeja = async (usuario, bandeja, { texto = '', soloVencidos = false } = {}) => {
    let filas;

    if (bandeja === 'elaboracion' || bandeja === 'enviados') {
        const estados = bandeja === 'elaboracion' ? ESTADOS_ELABORACION : ESTADOS_ENVIADOS;
        const documentos = await Documento.find({ 'creadoPor.id': usuario.id, estado: { $in: estados } })
            .sort({ updatedAt: -1 })
            .limit(300)
            .lean();
        filas = documentos.map(filaDeDocumento);
    } else {
        const tramites = await Tramite.find({ usuario: usuario.id, ...FILTROS[bandeja] })
            .populate('documento', CAMPOS_DOCUMENTO)
            .sort({ createdAt: -1 })
            .limit(300)
            .lean();
        filas = tramites.filter((t) => t.documento).map(filaDeTramite);
    }

    const buscado = normalizar(texto);
    return filas.filter((f) => {
        const coincideTexto =
            !buscado ||
            [f.codigoTramite, f.asunto, f.de?.nombre, f.tipoDocumento].some((c) => normalizar(c || '').includes(buscado));
        return coincideTexto && (!soloVencidos || f.vencido);
    });
};

const resumenBandejas = async (usuario) => {
    const mio = { usuario: usuario.id };
    const ahora = new Date();

    const [recibidos, recibidosSinLeer, vencidos, informados, informadosSinLeer, reasignados, archivados, elaboracion, enviados] =
        await Promise.all([
            Tramite.countDocuments({ ...mio, ...FILTROS.recibidos }),
            Tramite.countDocuments({ ...mio, tipo: 'para', estado: 'pendiente' }),
            Tramite.countDocuments({ ...mio, tipo: 'para', estado: { $in: ESTADOS_ATENDIBLES }, fechaLimite: { $ne: null, $lt: ahora } }),
            Tramite.countDocuments({ ...mio, ...FILTROS.informados }),
            Tramite.countDocuments({ ...mio, tipo: { $in: ['copia', 'informado'] }, estado: 'pendiente' }),
            Tramite.countDocuments({ ...mio, ...FILTROS.reasignados }),
            Tramite.countDocuments({ ...mio, ...FILTROS.archivados }),
            Documento.countDocuments({ 'creadoPor.id': usuario.id, estado: { $in: ESTADOS_ELABORACION } }),
            Documento.countDocuments({ 'creadoPor.id': usuario.id, estado: { $in: ESTADOS_ENVIADOS } })
        ]);

    return {
        elaboracion: { total: elaboracion },
        recibidos: { total: recibidos, sinLeer: recibidosSinLeer, vencidos },
        enviados: { total: enviados },
        informados: { total: informados, sinLeer: informadosSinLeer },
        reasignados: { total: reasignados },
        archivados: { total: archivados }
    };
};

// ---------- Recorrido (hoja de ruta) y destinatarios ----------

const recorridoDe = async (documento) => {
    const movimientos = await Movimiento.find({ documento: documento._id }).sort({ createdAt: 1 }).lean();
    let anterior = null;

    return movimientos.map((m) => {
        const dias = anterior ? Math.floor((new Date(m.createdAt) - anterior) / 86400000) : 0;
        anterior = new Date(m.createdAt);
        return { _id: String(m._id), tipo: m.tipo, de: m.de, para: m.para, comentario: m.comentario, fecha: m.createdAt, dias };
    });
};

// Los destinatarios originales del envío y si ya lo leyeron (acuse de lectura)
const destinatariosDe = async (documento) => {
    const tramites = await Tramite.find({
        documento: documento._id,
        origen: null,
        tipo: { $in: ['para', 'copia'] }
    })
        .populate('usuario', 'nombres apellidos departamento')
        .sort({ createdAt: 1 })
        .lean();

    return tramites
        .filter((t) => t.usuario)
        .map((t) => ({
            tipo: t.tipo,
            nombre: `${t.usuario.nombres} ${t.usuario.apellidos}`,
            departamento: t.usuario.departamento,
            estado: t.estado,
            fechaLectura: t.fechaLectura
        }));
};

// El trámite vigente del usuario sobre un documento (el activo, o el más reciente)
const miTramiteEn = async (documentoId, usuarioId) => {
    const items = await Tramite.find({ documento: documentoId, usuario: usuarioId }).sort({ createdAt: -1 });
    return items.find((t) => ESTADOS_ACTIVOS.includes(t.estado)) || items[0] || null;
};

const presentarTramite = (t) => ({
    _id: String(t._id),
    tipo: t.tipo,
    estado: t.estado,
    de: t.de,
    comentario: t.comentario,
    fechaLimite: t.fechaLimite,
    fechaLectura: t.fechaLectura,
    vencido: t.tipo === 'para' && ESTADOS_ATENDIBLES.includes(t.estado) && !!t.fechaLimite && new Date(t.fechaLimite) < new Date(),
    comentarioArchivo: t.comentarioArchivo,
    fechaArchivo: t.fechaArchivo,
    createdAt: t.createdAt
});

// Qué puede hacer el usuario con ese trámite ahora mismo
const accionesDeTramite = (t, documento, usuario) => {
    const puedeEnviar = usuario.permisos.includes('documentos.enviar') && !documento.bloqueado;
    return {
        reasignar: t.tipo === 'para' && ESTADOS_ATENDIBLES.includes(t.estado) && puedeEnviar,
        informar: ESTADOS_ACTIVOS.includes(t.estado) && puedeEnviar,
        archivar: ESTADOS_ACTIVOS.includes(t.estado),
        restaurar: t.estado === 'archivado',
        responder: ESTADOS_ACTIVOS.includes(t.estado) && t.tipo !== 'informado' && usuario.permisos.includes('documentos.registrar')
    };
};

module.exports = {
    ErrorTramite,
    BANDEJAS,
    personaDeSesion,
    enviar,
    leer,
    reasignar,
    informar,
    archivar,
    restaurar,
    listarBandeja,
    resumenBandejas,
    recorridoDe,
    destinatariosDe,
    miTramiteEn,
    presentarTramite,
    accionesDeTramite
};