// Roles, permisos y cálculo de los permisos efectivos de un usuario (RF-04 y RF-05).

const ROLES = ['Superadmin', 'Gerencia', 'TIC', 'Secretaría', 'Usuario institucional'];

// código del permiso → descripción que se muestra en pantalla
const PERMISOS = {
    'documentos.registrar': 'Registrar documentos',
    'documentos.consultar': 'Consultar y buscar documentos',
    'documentos.descargar': 'Ver y descargar archivos',
    'documentos.versionar': 'Crear nuevas versiones',
    'documentos.anexar': 'Adjuntar anexos a un documento',
    'documentos.modificar': 'Modificar los datos de un documento',
    'documentos.estado': 'Gestionar el estado del documento',
    'documentos.aprobar': 'Revisar, aprobar o rechazar documentos',
    'documentos.verTodos': 'Acceder a todos los documentos de la institución',
    'integridad.verificar': 'Verificar la integridad (SHA-256)',
    'integridad.desbloquear': 'Desbloquear documentos alterados',
    'bitacora.consultar': 'Consultar la bitácora y la trazabilidad',
    'auditoria.ejecutar': 'Ejecutar la auditoría general',
    'usuarios.gestionar': 'Registrar y dar de baja usuarios',
    'roles.gestionar': 'Asignar y modificar roles',
    'permisos.gestionar': 'Asignar, modificar y retirar permisos'
};

const TODOS_LOS_PERMISOS = Object.keys(PERMISOS);

// Lo que puede hacer quien participa en un documento (no incluye ver los de otras áreas)
const PERMISOS_PARTICIPANTE = [
    'documentos.registrar',
    'documentos.consultar',
    'documentos.descargar',
    'documentos.versionar',
    'documentos.anexar',
    'documentos.modificar',
    'documentos.estado'
];

// Permisos que trae cada rol por defecto
const PERMISOS_POR_ROL = {
    'Superadmin': TODOS_LOS_PERMISOS,
    'Gerencia': [
        'documentos.consultar',
        'documentos.descargar',
        'documentos.aprobar',
        'documentos.verTodos',
        'integridad.verificar',
        'integridad.desbloquear',
        'bitacora.consultar',
        'auditoria.ejecutar',
        'usuarios.gestionar',
        'roles.gestionar',
        'permisos.gestionar'
    ],
    'TIC': [
        'documentos.consultar',
        'usuarios.gestionar',
        'roles.gestionar',
        'permisos.gestionar'
    ],
    'Secretaría': [...PERMISOS_PARTICIPANTE, 'documentos.verTodos'],
    'Usuario institucional': PERMISOS_PARTICIPANTE
};

// Permisos del rol + permisos agregados - permisos retirados.
// El Superadmin siempre tiene todos los permisos.
const permisosEfectivos = ({ roles = [], permisosExtra = [], permisosRetirados = [] }) => {
    if (roles.includes('Superadmin')) {
        return [...TODOS_LOS_PERMISOS];
    }

    const conjunto = new Set();
    roles.forEach((rol) => (PERMISOS_POR_ROL[rol] || []).forEach((p) => conjunto.add(p)));
    permisosExtra.forEach((p) => conjunto.add(p));
    permisosRetirados.forEach((p) => conjunto.delete(p));

    return [...conjunto];
};

module.exports = { ROLES, PERMISOS, TODOS_LOS_PERMISOS, PERMISOS_POR_ROL, permisosEfectivos };