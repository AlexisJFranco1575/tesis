// Flujo documental: estados y cambios permitidos (RF-18 y RF-19).

const ESTADOS = ['Generado', 'En Revisión', 'Rechazado', 'Aprobado', 'Distribuido', 'Archivado'];

// estado actual → { estado siguiente: permiso necesario para el cambio }
const TRANSICIONES = {
    'Generado': { 'En Revisión': 'documentos.estado' },
    'En Revisión': { 'Aprobado': 'documentos.aprobar', 'Rechazado': 'documentos.aprobar' },
    'Rechazado': { 'En Revisión': 'documentos.estado' },
    'Aprobado': { 'Distribuido': 'documentos.estado', 'Archivado': 'documentos.estado' },
    'Distribuido': { 'Archivado': 'documentos.estado' },
    'Archivado': { 'Generado': 'documentos.estado' } // recuperar un documento archivado
};

// Solo en estos estados se puede modificar el documento o crear nuevas versiones
const ESTADOS_EDITABLES = ['Generado', 'Rechazado'];

module.exports = { ESTADOS, TRANSICIONES, ESTADOS_EDITABLES };