// Permisos, roles base y registro en memoria de los roles (RF-04 y RF-05).

// código del permiso → descripción que se muestra en pantalla
const PERMISOS = {
    'documentos.registrar': 'Registrar documentos',
    'documentos.consultar': 'Consultar y buscar documentos',
    'documentos.descargar': 'Ver y descargar archivos',
    'documentos.versionar': 'Crear nuevas versiones',
    'documentos.anexar': 'Adjuntar anexos a un documento',
    'documentos.modificar': 'Modificar los datos de un documento',
    'documentos.estado': 'Gestionar el estado del documento',
    'documentos.enviar': 'Enviar, reasignar e informar documentos',
    'documentos.aprobar': 'Revisar, aprobar o rechazar documentos',
    'documentos.verTodos': 'Acceder a todos los documentos de la institución',
    'integridad.verificar': 'Verificar la integridad (SHA-256)',
    'integridad.desbloquear': 'Desbloquear documentos alterados',
    'bitacora.consultar': 'Consultar la bitácora y la trazabilidad',
    'auditoria.ejecutar': 'Ejecutar la auditoría general',
    'usuarios.gestionar': 'Registrar y dar de baja usuarios',
    'roles.gestionar': 'Crear y asignar roles',
    'permisos.gestionar': 'Asignar, modificar y retirar permisos',
    'areas.gestionar': 'Administrar el catálogo de áreas'
};

const TODOS_LOS_PERMISOS = Object.keys(PERMISOS);

// Permisos operativos: el trabajo diario sobre los documentos de la propia área. Se otorgan libremente.
const PERMISOS_OPERATIVOS = [
    'documentos.registrar',
    'documentos.consultar',
    'documentos.descargar',
    'documentos.versionar',
    'documentos.anexar',
    'documentos.modificar',
    'documentos.estado',
    'documentos.enviar'
];

// Permisos sensibles: aprobar, ver todo, verificar, auditar y administrar.
// Nadie puede otorgar uno que no posee.
const PERMISOS_SENSIBLES = TODOS_LOS_PERMISOS.filter((p) => !PERMISOS_OPERATIVOS.includes(p));

// Roles base: se guardan en la base de datos la primera vez que arranca el sistema
const ROLES_BASE = [
    {
        nombre: 'Superadmin',
        protegido: true,
        descripcion: 'Administra todo el sistema: usuarios, roles, permisos, áreas, auditoría y recuperación de cuentas. Es el rol del administrador técnico y no pertenece a un área.',
        permisos: [...TODOS_LOS_PERMISOS]
    },
    {
        nombre: 'Gerencia',
        protegido: true,
        descripcion: 'Máxima autoridad de la institución: elabora y reasigna documentos, revisa y aprueba o rechaza los que lo requieren, ve todos los trámites, consulta la bitácora y ejecuta auditorías.',
        permisos: [
            ...PERMISOS_OPERATIVOS,
            'documentos.aprobar',
            'documentos.verTodos',
            'integridad.verificar',
            'integridad.desbloquear',
            'bitacora.consultar',
            'auditoria.ejecutar',
            'usuarios.gestionar',
            'roles.gestionar',
            'permisos.gestionar',
            'areas.gestionar'
        ]
    },
    {
        nombre: 'TIC',
        protegido: false,
        descripcion: 'Soporte tecnológico: administra cuentas, roles, permisos y áreas, y elabora documentos de su área.',
        permisos: [...PERMISOS_OPERATIVOS, 'usuarios.gestionar', 'roles.gestionar', 'permisos.gestionar', 'areas.gestionar']
    },
    {
        nombre: 'Secretaría',
        protegido: false,
        descripcion: 'Gestión documental central: registra, distribuye y archiva documentos, y accede a los de todas las áreas.',
        permisos: [...PERMISOS_OPERATIVOS, 'documentos.verTodos']
    },
    {
        nombre: 'Funcionario',
        protegido: false,
        descripcion: 'Personal de cualquier área: elabora, envía y consulta los documentos en los que participa su área.',
        permisos: [...PERMISOS_OPERATIVOS]
    }
];

// ---------- Registro en memoria ----------
// Se llena desde la base de datos (services/catalogo.service.js). Si aún está vacío se usan los roles base.

const registro = new Map();
const base = new Map(ROLES_BASE.map((r) => [r.nombre, r]));

const cargarRegistro = (roles) => {
    registro.clear();
    for (const rol of roles) {
        if (rol.activo !== false) {
            registro.set(rol.nombre, {
                permisos: [...rol.permisos],
                protegido: !!rol.protegido,
                descripcion: rol.descripcion || ''
            });
        }
    }
};

const obtenerRol = (nombre) => registro.get(nombre) ?? (registro.size === 0 ? base.get(nombre) : undefined);
const listarNombresRoles = () => (registro.size > 0 ? [...registro.keys()] : ROLES_BASE.map((r) => r.nombre));
const existeRol = (nombre) => !!obtenerRol(nombre);
const esRolProtegido = (nombre) => obtenerRol(nombre)?.protegido === true;

const infoRoles = () =>
    Object.fromEntries(
        listarNombresRoles().map((n) => [n, { descripcion: obtenerRol(n).descripcion, protegido: !!obtenerRol(n).protegido }])
    );

const permisosPorRol = () =>
    Object.fromEntries(listarNombresRoles().map((n) => [n, [...obtenerRol(n).permisos]]));

// Permisos del rol + permisos agregados - permisos retirados.
// El Superadmin siempre tiene todos los permisos.
const permisosEfectivos = ({ roles = [], permisosExtra = [], permisosRetirados = [] }) => {
    if (roles.includes('Superadmin')) {
        return [...TODOS_LOS_PERMISOS];
    }

    const conjunto = new Set();
    roles.forEach((rol) => (obtenerRol(rol)?.permisos || []).forEach((p) => conjunto.add(p)));
    permisosExtra.forEach((p) => conjunto.add(p));
    permisosRetirados.forEach((p) => conjunto.delete(p));

    return [...conjunto];
};

module.exports = {
    PERMISOS,
    PERMISOS_OPERATIVOS,
    PERMISOS_SENSIBLES,
    TODOS_LOS_PERMISOS,
    ROLES_BASE,
    cargarRegistro,
    listarNombresRoles,
    existeRol,
    esRolProtegido,
    infoRoles,
    permisosPorRol,
    permisosEfectivos
};