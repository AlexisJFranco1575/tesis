require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const authRoutes = require('./routes/authRoutes');
const documentosRoutes = require('./routes/documentos.routes');
const bitacoraRoutes = require('./routes/bitacora.routes');

// Variables obligatorias: si faltan, el servidor no arranca
const { MONGODB_URI, JWT_SECRET } = process.env;
if (!MONGODB_URI || !JWT_SECRET) {
    console.error('❌ Faltan variables de entorno: MONGODB_URI y JWT_SECRET son obligatorias.');
    process.exit(1);
}

const app = express();

// MIDDLEWARES (deben ir antes de las rutas)
app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:4200',
    exposedHeaders: ['Content-Disposition']
}));
app.use(express.json());

// Ruta de salud: sirve para comprobar rápido que la API y la BD responden
app.get('/api/salud', (req, res) => {
    res.json({
        estado: 'ok',
        baseDeDatos: mongoose.connection.readyState === 1 ? 'conectada' : 'desconectada'
    });
});

// RUTAS
app.use('/api/auth', authRoutes);
app.use('/api/documentos', documentosRoutes);
app.use('/api/bitacora', bitacoraRoutes);

// Ruta inexistente
app.use((req, res) => {
    res.status(404).json({ mensaje: 'Ruta no encontrada.' });
});

// Manejo central de errores (por ejemplo: archivo que no es PDF o demasiado grande)
app.use((err, req, res, next) => {
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ mensaje: 'El archivo supera el tamaño máximo permitido de 20 MB.' });
    }
    console.error('Error:', err.message);
    res.status(err.status || 400).json({ mensaje: err.message || 'Error al procesar la solicitud.' });
});

// Conexión a MongoDB y arranque del servidor
const PORT = process.env.PORT || 3000;

mongoose.connect(MONGODB_URI)
    .then(() => {
        console.log('✅ Base de datos MongoDB conectada exitosamente');
        app.listen(PORT, () => {
            console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
        });
    })
    .catch((err) => {
        console.error('❌ Error al conectar a MongoDB:', err.message);
        process.exit(1);
    });