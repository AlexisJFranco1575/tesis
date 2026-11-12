// Estructura de la EP-ULEAM según el documento de roles. Se carga una sola vez, si el catálogo está vacío;
// después el administrador la gestiona desde la pantalla "Áreas".

const AREAS_BASE = [
    {
        nombre: 'Gerencia General',
        siglas: 'GG',
        hijos: [
            { nombre: 'Secretaría General', siglas: 'SG' },
            {
                nombre: 'Área Financiera',
                siglas: 'AF',
                hijos: [
                    { nombre: 'Contabilidad', siglas: 'CONT' },
                    { nombre: 'Tesorería', siglas: 'TES' },
                    { nombre: 'Facturación', siglas: 'FAC' },
                    { nombre: 'Presupuesto', siglas: 'PRES' },
                    { nombre: 'Asistencia de Control', siglas: 'AC' }
                ]
            },
            { nombre: 'Ventas', siglas: 'VEN' },
            { nombre: 'Tecnologías de la Información', siglas: 'TIC' },
            { nombre: 'Compras Públicas', siglas: 'CP' },
            { nombre: 'Talento Humano', siglas: 'TH' },
            { nombre: 'CENFOR', siglas: 'CENFOR', tipo: 'unidad' },
            { nombre: 'Escuela de Conducción', siglas: 'EC', tipo: 'unidad' },
            { nombre: 'Centro Gastronómico', siglas: 'CG', tipo: 'unidad' },
            { nombre: 'Limpieza', siglas: 'LIM', tipo: 'unidad' },
            { nombre: 'Almacén Universitario', siglas: 'AU', tipo: 'unidad' }
        ]
    }
];

module.exports = { AREAS_BASE };