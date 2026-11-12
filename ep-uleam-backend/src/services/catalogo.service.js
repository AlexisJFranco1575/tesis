const Rol = require('../models/Rol');
const Area = require('../models/Area');
const { ROLES_BASE, TODOS_LOS_PERMISOS, cargarRegistro } = require('../config/roles');
const { AREAS_BASE } = require('../config/areas');
const { normalizar } = require('../utils/acceso');

// Vuelve a leer los roles de la base de datos al registro en memoria
const recargarRoles = async () => {
    cargarRegistro(await Rol.find().lean());
};

const sembrarRoles = async () => {
    for (const base of ROLES_BASE) {
        if (!(await Rol.exists({ nombre: base.nombre }))) {
            await Rol.create({ ...base, sistema: true });
        }
    }
    // El Superadmin siempre tiene todos los permisos (incluye los que se agreguen en versiones futuras)
    await Rol.updateOne({ nombre: 'Superadmin' }, { permisos: [...TODOS_LOS_PERMISOS], protegido: true, sistema: true });
};

const crearArbol = async (nodos, padre = null) => {
    for (const nodo of nodos) {
        const area = await Area.create({
            nombre: nodo.nombre,
            siglas: nodo.siglas || '',
            tipo: nodo.tipo || 'area',
            padre
        });
        if (nodo.hijos) {
            await crearArbol(nodo.hijos, area._id);
        }
    }
};

const sembrarAreas = async () => {
    if ((await Area.countDocuments()) === 0) {
        await crearArbol(AREAS_BASE);
    }
};

const inicializarCatalogos = async () => {
    await sembrarRoles();
    await sembrarAreas();
    await recargarRoles();
};

// Se inicializa una sola vez por proceso, antes de atender la primera petición
let promesa = null;
const asegurarCatalogos = () => {
    if (!promesa) {
        promesa = inicializarCatalogos().catch((error) => {
            promesa = null;
            throw error;
        });
    }
    return promesa;
};

// Devuelve el área activa del catálogo que corresponde al texto (sin importar tildes ni mayúsculas)
const resolverArea = async (texto) => {
    const clave = normalizar(String(texto || ''));
    return clave ? Area.findOne({ claveNombre: clave, activa: true }) : null;
};

module.exports = { inicializarCatalogos, asegurarCatalogos, recargarRoles, resolverArea };