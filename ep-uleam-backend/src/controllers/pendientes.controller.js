const Usuario = require('../models/Usuario');
const Documento = require('../models/Documento');
const { esParticipante } = require('../utils/acceso');
const { bloqueoVigente } = require('../utils/bloqueo');
const { resumenBandejas } = require('../services/tramite.service');

// GET /api/pendientes
// Devuelve lo que el usuario tiene por atender ahora, calculado desde el estado real del sistema.
const obtenerPendientes = async (req, res) => {
    try {
        const permisos = req.usuario.permisos;
        const tiene = (...lista) => lista.some((p) => permisos.includes(p));
        const items = [];
        const advertencias = [];

        const agregar = (clave, titulo, cantidad, ruta, nivel, filtroEstado) => {
            if (cantidad > 0) {
                items.push({ clave, titulo, cantidad, ruta, nivel, ...(filtroEstado ? { filtroEstado } : {}) });
            }
        };

        // Bandejas del propio usuario
        const bandejas = await resumenBandejas(req.usuario);
        agregar('recibidos-vencidos', 'Documentos con plazo vencido', bandejas.recibidos.vencidos, '/dashboard/bandejas/recibidos', 'alerta');
        agregar('recibidos-sin-leer', 'Documentos recibidos sin leer', bandejas.recibidos.sinLeer, '/dashboard/bandejas/recibidos', 'info');
        agregar('informados-sin-leer', 'Documentos informados sin leer', bandejas.informados.sinLeer, '/dashboard/bandejas/informados', 'info');

        // Administración de usuarios
        if (tiene('usuarios.gestionar')) {
            const usuarios = await Usuario.find({ estado: true }).select('solicitoRecuperacion bloqueado bloqueadoEn roles');

            agregar(
                'solicitudes-recuperacion',
                'Solicitudes de recuperación de contraseña',
                usuarios.filter((u) => u.solicitoRecuperacion).length,
                '/dashboard/usuarios',
                'info'
            );
            agregar(
                'cuentas-bloqueadas',
                'Cuentas bloqueadas',
                usuarios.filter((u) => u.bloqueado && bloqueoVigente(u)).length,
                '/dashboard/usuarios',
                'alerta'
            );

            if (req.usuario.roles.includes('Superadmin')) {
                const superadmins = usuarios.filter((u) => u.roles.includes('Superadmin')).length;
                if (superadmins < 2) {
                    advertencias.push(
                        'Solo hay un Superadmin activo. Registre un segundo como respaldo: si esta cuenta se bloquea o se pierde, no habrá quien administre el sistema.'
                    );
                }
            }
        }

        // Documentos de los que el usuario participa
        if (tiene('documentos.aprobar', 'documentos.versionar', 'integridad.verificar')) {
            const documentos = (
                await Documento.find({ $or: [{ estado: { $in: ['En Revisión', 'Rechazado'] } }, { bloqueado: true }] })
                    .select('estado bloqueado creadoPor remitente destinatario involucrados confidencial')
                    .lean()
            ).filter((d) => esParticipante(req.usuario, d));

            if (tiene('documentos.aprobar')) {
                agregar(
                    'documentos-por-revisar',
                    'Documentos pendientes de su revisión',
                    documentos.filter((d) => d.estado === 'En Revisión').length,
                    '/dashboard/documentos',
                    'info',
                    'En Revisión'
                );
            }
            if (tiene('documentos.versionar')) {
                agregar(
                    'documentos-rechazados',
                    'Documentos rechazados que debe corregir',
                    documentos.filter((d) => d.estado === 'Rechazado').length,
                    '/dashboard/documentos',
                    'alerta',
                    'Rechazado'
                );
            }
            if (tiene('integridad.verificar')) {
                agregar(
                    'documentos-bloqueados',
                    'Documentos bloqueados por alteración',
                    documentos.filter((d) => d.bloqueado).length,
                    '/dashboard/documentos',
                    'alerta'
                );
            }
        }

        res.json({
            total: items.reduce((suma, item) => suma + item.cantidad, 0),
            items,
            advertencias
        });
    } catch (error) {
        console.error('Error al calcular los pendientes:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
};

module.exports = { obtenerPendientes };