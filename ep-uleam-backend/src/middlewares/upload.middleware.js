// Carga del archivo principal de un documento o de una nueva versión: PDF, Word (.docx) o Excel (.xlsx).
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const { FORMATOS_DOCUMENTO } = require('../config/clasificacion');

const TAMANO_MAXIMO = 20 * 1024 * 1024; // 20 MB

const directorio = () => process.env.UPLOADS_DIR || './uploads';

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        fs.mkdirSync(directorio(), { recursive: true });
        cb(null, directorio());
    },
    filename: (req, file, cb) => {
        // Nombre generado por el servidor: evita caracteres raros y colisiones
        cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${FORMATOS_DOCUMENTO[file.mimetype]}`);
    }
});

// Algunos navegadores envían el nombre con tildes mal codificado ("EvaluaciÃ³n")
const corregirCodificacion = (nombre) => {
    const corregido = Buffer.from(nombre, 'latin1').toString('utf8');
    return corregido.includes('\ufffd') ? nombre : corregido;
};

const fileFilter = (req, file, cb) => {
    if (!FORMATOS_DOCUMENTO[file.mimetype]) {
        return cb(new Error('Formato no válido. Se permiten archivos PDF, Word (.docx) y Excel (.xlsx).'));
    }
    file.originalname = corregirCodificacion(file.originalname);
    cb(null, true);
};

module.exports = multer({ storage, fileFilter, limits: { fileSize: TAMANO_MAXIMO, files: 1 } });