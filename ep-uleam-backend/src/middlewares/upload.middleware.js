// src/middlewares/upload.middleware.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './uploads';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        // Renombra el archivo para evitar duplicados: timestamp + nombre original
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

// Filtro opcional para aceptar solo PDFs (nivel profesional)
const fileFilter = (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
        cb(null, true);
    } else {
        cb(new Error('Formato no válido. Solo se permiten archivos PDF.'));
    }
};

const upload = multer({ storage, fileFilter });

module.exports = upload;