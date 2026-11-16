// Categorías documentales, reglas de aprobación y formatos permitidos (RF-08, CU-10).

const TIPOS_DOCUMENTO = ['Oficio', 'Memorando', 'Circular', 'Nota', 'Resolución', 'Informe Técnico', 'Contrato'];

// Un documento puede tener anexos de distintos tipos documentales (CU-10 A2)
const TIPOS_ANEXO = [...TIPOS_DOCUMENTO, 'Factura', 'Certificado', 'Fotografía', 'Otro'];

// Prioridad con la que se envía un documento
const PRIORIDADES = ['Normal', 'Urgente', 'Extemporáneo'];

// Tipos que exigen la aprobación de Gerencia antes de enviarse.
// Los demás (memorandos, circulares, notas e informes) pueden enviarse directamente.
const TIPOS_CON_APROBACION = ['Oficio', 'Resolución', 'Contrato'];

const requiereAprobacion = (tipo) => TIPOS_CON_APROBACION.includes(tipo);

// Siglas del tipo, para el número automático (ej. SG-2026-0001-MEM)
const SIGLAS_TIPO = {
    'Oficio': 'OFI',
    'Memorando': 'MEM',
    'Circular': 'CIR',
    'Nota': 'NOT',
    'Resolución': 'RES',
    'Informe Técnico': 'INF',
    'Contrato': 'CON'
};

// Formatos permitidos para el archivo principal de un documento: tipo MIME → extensión
const FORMATOS_DOCUMENTO = {
    'application/pdf': '.pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx'
};

// Máximo de caracteres del contenido de un documento redactado en el sistema
const LIMITE_CUERPO = 15000;

module.exports = {
    TIPOS_DOCUMENTO,
    TIPOS_ANEXO,
    PRIORIDADES,
    TIPOS_CON_APROBACION,
    requiereAprobacion,
    SIGLAS_TIPO,
    FORMATOS_DOCUMENTO,
    LIMITE_CUERPO
};