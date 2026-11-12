// Categorías documentales y reglas de aprobación (RF-08, CU-10).

const TIPOS_DOCUMENTO = ['Oficio', 'Memorando', 'Circular', 'Nota', 'Resolución', 'Informe Técnico', 'Contrato'];

// Un documento puede tener anexos de distintos tipos documentales (CU-10 A2)
const TIPOS_ANEXO = [...TIPOS_DOCUMENTO, 'Factura', 'Certificado', 'Fotografía', 'Otro'];

// Prioridad con la que se envía un documento
const PRIORIDADES = ['Normal', 'Urgente', 'Extemporáneo'];

// Tipos que exigen la aprobación de Gerencia antes de enviarse.
// Los demás (memorandos, circulares, notas e informes) pueden enviarse directamente.
const TIPOS_CON_APROBACION = ['Oficio', 'Resolución', 'Contrato'];

const requiereAprobacion = (tipo) => TIPOS_CON_APROBACION.includes(tipo);

module.exports = { TIPOS_DOCUMENTO, TIPOS_ANEXO, PRIORIDADES, TIPOS_CON_APROBACION, requiereAprobacion };