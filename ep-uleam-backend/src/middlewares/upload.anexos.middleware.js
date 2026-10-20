// src/middlewares/upload.anexos.middleware.js
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');

const TAMANO_MAXIMO = 20 * 1024 * 1024; // 20 MB por archivo
const MAXIMO_ARCHIVOS = 10;

const directorio = () => process.env.UPLOADS_DIR || './uploads';

// Formatos permitidos para anexos: tipo MIME → extensión con la que se guarda
const FORMATOS_ANEXO = {
    'application/pdf': '.pdf',
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx'
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        fs.mkdirSync(directorio(), { recursive: true });
        cb(null, directorio());
    },
    filename: (req, file, cb) => {
        // Nombre generado por el servidor: evita caracteres raros y colisiones
        cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${FORMATOS_ANEXO[file.mimetype]}`);
    }
});

// Algunos navegadores envían el nombre con tildes mal codificado ("EvaluaciÃ³n")
const corregirCodificacion = (nombre) => {
    const corregido = Buffer.from(nombre, 'latin1').toString('utf8');
    return corregido.includes('\ufffd') ? nombre : corregido;
};

const fileFilter = (req, file, cb) => {
    if (!FORMATOS_ANEXO[file.mimetype]) {
        return cb(new Error('Formato no permitido. Se aceptan PDF, PNG, JPG, DOCX y XLSX.'));
    }
    file.originalname = corregirCodificacion(file.originalname);
    cb(null, true);
};

const cargarAnexos = multer({
    storage,
    fileFilter,
    limits: { fileSize: TAMANO_MAXIMO, files: MAXIMO_ARCHIVOS }
}).array('archivos', MAXIMO_ARCHIVOS);

module.exports = { cargarAnexos };