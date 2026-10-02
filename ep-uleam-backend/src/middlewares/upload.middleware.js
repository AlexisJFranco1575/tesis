// src/middlewares/upload.middleware.js
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');

const DIRECTORIO = './uploads';
const TAMANO_MAXIMO = 20 * 1024 * 1024; // 20 MB

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        fs.mkdirSync(DIRECTORIO, { recursive: true });
        cb(null, DIRECTORIO);
    },
    filename: (req, file, cb) => {
        // Nombre generado por el servidor: evita caracteres raros y colisiones
        cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.pdf`);
    }
});

// Algunos navegadores envían el nombre con tildes mal codificado ("EvaluaciÃ³n")
const corregirCodificacion = (nombre) => {
    const corregido = Buffer.from(nombre, 'latin1').toString('utf8');
    return corregido.includes('\ufffd') ? nombre : corregido;
};

const fileFilter = (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
        return cb(new Error('Formato no válido. Solo se permiten archivos PDF.'));
    }
    file.originalname = corregirCodificacion(file.originalname);
    cb(null, true);
};

module.exports = multer({ storage, fileFilter, limits: { fileSize: TAMANO_MAXIMO, files: 1 } });