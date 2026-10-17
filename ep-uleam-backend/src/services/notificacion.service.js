const Notificacion = require('../models/Notificacion');
const Usuario = require('../models/Usuario');
const { armarSesion } = require('../utils/sesion');
const { normalizar } = require('../utils/acceso');

const sesionesActivas = async () => (await Usuario.find({ estado: true })).map(armarSesion);

// Crea una notificación por destinatario. Con evitarDuplicado no repite una alerta
// que el usuario todavía no ha leído (p. ej. verificaciones repetidas del mismo documento).
const crear = async (idsDestinatarios, datos, { evitarDuplicado = false } = {}) => {
    let ids = [...new Set(idsDestinatarios.map(String))];

    if (evitarDuplicado && ids.length > 0) {
        const yaTienen = (await Notificacion.distinct('usuario', {
            usuario: { $in: ids },
            documento: datos.documento ?? null,
            titulo: datos.titulo,
            leida: false
        })).map(String);
        ids = ids.filter((id) => !yaTienen.includes(id));
    }

    if (ids.length === 0) {
        return;
    }
    await Notificacion.insertMany(ids.map((usuario) => ({ usuario, ...datos })));
};

// Eventos de seguridad e integridad: se detectan a partir de lo que queda en la bitácora
const notificarEventoSistema = async (entrada) => {
    switch (entrada.accion) {
        case 'ALERTA_ALTERACION': {
            const destinatarios = (await sesionesActivas()).filter((s) => s.permisos.includes('integridad.verificar'));
            await crear(destinatarios.map((s) => s.id), {
                tipo: 'ALERTA',
                titulo: 'Alerta de alteración',
                mensaje: `El documento ${entrada.codigoTramite} no coincide con su hash SHA-256 y fue bloqueado. ${entrada.detalle}`,
                documento: entrada.documento,
                codigoTramite: entrada.codigoTramite
            }, { evitarDuplicado: true });
            break;
        }

        case 'CUENTA_BLOQUEADA': {
            const destinatarios = (await sesionesActivas())
                .filter((s) => s.permisos.includes('usuarios.gestionar') && s.id !== entrada.usuario.id);
            await crear(destinatarios.map((s) => s.id), {
                tipo: 'ALERTA',
                titulo: 'Cuenta bloqueada',
                mensaje: `La cuenta de ${entrada.usuario.nombre} se bloqueó por superar los intentos de acceso permitidos.`
            });
            break;
        }

        case 'SOLICITUD_RECUPERACION': {
            const destinatarios = (await sesionesActivas())
                .filter((s) => s.permisos.includes('usuarios.gestionar') && s.id !== entrada.usuario.id);
            await crear(destinatarios.map((s) => s.id), {
                tipo: 'INFO',
                titulo: 'Solicitud de recuperación',
                mensaje: `${entrada.usuario.nombre} solicitó una clave temporal para recuperar su acceso.`
            });
            break;
        }

        default:
            break; // el resto de acciones no genera notificación (CU-26 A1)
    }
};

// Eventos del flujo documental
const notificarFlujo = async ({ evento, documento, actor, observacion = '' }) => {
    const sesiones = (await sesionesActivas()).filter((s) => s.id !== actor.id);

    const departamentoRemitente = normalizar(documento.remitente.departamento);
    const departamentoDestinatario = normalizar(documento.destinatario.departamento);

    const esCreador = (s) => s.id === documento.creadoPor.id;
    const esDelRemitente = (s) => normalizar(s.departamento) === departamentoRemitente;
    const esDelDestinatario = (s) => normalizar(s.departamento) === departamentoDestinatario;
    const puede = (s, ...permisos) => permisos.every((p) => s.permisos.includes(p));

    const resumen = `${documento.codigoTramite} (${documento.asunto})`;
    let tipo = 'FLUJO';
    let titulo;
    let mensaje;
    let destinatarios = [];

    switch (evento) {
        case 'ENVIADO_REVISION':
            destinatarios = sesiones.filter((s) => puede(s, 'documentos.aprobar'));
            titulo = 'Documento pendiente de revisión';
            mensaje = `${actor.nombreCompleto} envió a revisión el documento ${resumen}.`;
            break;

        case 'APROBADO':
            destinatarios = sesiones.filter((s) => esCreador(s) || esDelRemitente(s) || puede(s, 'documentos.estado', 'documentos.verTodos'));
            titulo = 'Documento aprobado';
            mensaje = `${actor.nombreCompleto} aprobó el documento ${resumen}.${observacion ? ` Observación: ${observacion}` : ''}`;
            break;

        case 'RECHAZADO':
            tipo = 'ALERTA';
            destinatarios = sesiones.filter((s) => esCreador(s) || (esDelRemitente(s) && puede(s, 'documentos.versionar')));
            titulo = 'Documento rechazado';
            mensaje = `${actor.nombreCompleto} rechazó el documento ${resumen}. Observación: ${observacion}`;
            break;

        case 'DISTRIBUIDO':
            destinatarios = sesiones.filter((s) => esCreador(s) || esDelDestinatario(s));
            titulo = 'Documento distribuido';
            mensaje = `${actor.nombreCompleto} distribuyó el documento ${resumen} a ${documento.destinatario.departamento}.`;
            break;

        case 'ARCHIVADO':
            destinatarios = sesiones.filter(esCreador);
            titulo = 'Documento archivado';
            mensaje = `${actor.nombreCompleto} archivó el documento ${resumen}.`;
            break;

        case 'RECUPERADO':
            destinatarios = sesiones.filter(esCreador);
            titulo = 'Documento recuperado';
            mensaje = `${actor.nombreCompleto} recuperó del archivo el documento ${resumen}.`;
            break;

        default:
            return;
    }

    await crear(destinatarios.map((s) => s.id), {
        tipo,
        titulo,
        mensaje,
        documento: documento._id,
        codigoTramite: documento.codigoTramite
    });
};

module.exports = { notificarEventoSistema, notificarFlujo };