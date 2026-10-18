// Categorías documentales (RF-08, CU-10).

const TIPOS_DOCUMENTO = ['Oficio', 'Memorando', 'Resolución', 'Informe Técnico', 'Contrato'];

// Un documento puede tener anexos de distintos tipos documentales (CU-10 A2)
const TIPOS_ANEXO = [...TIPOS_DOCUMENTO, 'Factura', 'Certificado', 'Fotografía', 'Otro'];

module.exports = { TIPOS_DOCUMENTO, TIPOS_ANEXO };