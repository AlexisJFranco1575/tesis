const { TRANSICIONES } = require('../config/flujo');

// Compara nombres de departamento sin importar mayúsculas, tildes ni espacios de más
const normalizar = (texto = '') =>
    String(texto)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

// Un usuario participa en un documento si lo creó, si su departamento es el remitente o el
// destinatario, o si tiene permiso para acceder a todos los documentos (Gerencia, Secretaría...)
const esParticipante = (usuario, documento) => {
    if (usuario.permisos.includes('documentos.verTodos')) {
        return true;
    }
    if (documento.creadoPor?.id && documento.creadoPor.id === usuario.id) {
        return true;
    }

    const departamento = normalizar(usuario.departamento);
    if (!departamento) {
        return false;
    }
    return [documento.remitente?.departamento, documento.destinatario?.departamento]
        .some((d) => normalizar(d) === departamento);
};

// Cambios de estado que el usuario puede ejecutar ahora mismo sobre el documento
const transicionesPara = (documento, usuario) => {
    if (documento.bloqueado) {
        return [];
    }
    return Object.entries(TRANSICIONES[documento.estado] || {})
        .filter(([, permiso]) => usuario.permisos.includes(permiso))
        .map(([estado]) => ({ estado, requiereObservacion: estado === 'Rechazado' }));
};

module.exports = { normalizar, esParticipante, transicionesPara };