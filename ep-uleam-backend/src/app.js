const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');

const authRoutes = require('./routes/authRoutes');
const usuariosRoutes = require('./routes/usuarios.routes');
const documentosRoutes = require('./routes/documentos.routes');
const bitacoraRoutes = require('./routes/bitacora.routes');
const notificacionesRoutes = require('./routes/notificaciones.routes');
const { limiteGeneral } = require('./middlewares/limites');

const app = express();

// Detrás de un proxy (Nginx, en producción) se indica cuántos saltos confiar para leer la IP real
if (process.env.TRUST_PROXY) {
    app.set('trust proxy', Number(process.env.TRUST_PROXY));
}

// Cabeceras de seguridad (también quita X-Powered-By)
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:4200',
    exposedHeaders: ['Content-Disposition']
}));

// Los archivos se suben por multipart; el JSON solo lleva datos pequeños
app.use(express.json({ limit: '100kb' }));

// Ruta de salud: sirve para comprobar rápido que la API y la BD responden (sin límite de peticiones)
app.get('/api/salud', (req, res) => {
    res.json({
        estado: 'ok',
        baseDeDatos: mongoose.connection.readyState === 1 ? 'conectada' : 'desconectada'
    });
});

app.use('/api', limiteGeneral);

// RUTAS
app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/documentos', documentosRoutes);
app.use('/api/bitacora', bitacoraRoutes);
app.use('/api/notificaciones', notificacionesRoutes);

// Ruta inexistente
app.use((req, res) => {
    res.status(404).json({ mensaje: 'Ruta no encontrada.' });
});

// Manejo central de errores (archivo con formato no válido, demasiado grande, demasiados archivos...)
app.use((err, req, res, next) => {
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ mensaje: 'Un archivo supera el tamaño máximo permitido de 20 MB.' });
    }
    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ mensaje: 'Solo puede adjuntar hasta 10 archivos por carga.' });
    }
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ mensaje: 'La petición es demasiado grande.' });
    }
    console.error('Error:', err.message);
    res.status(err.status || 400).json({ mensaje: err.message || 'Error al procesar la solicitud.' });
});

module.exports = app;