require('dotenv').config();
const mongoose = require('mongoose');

// Variables obligatorias: si faltan, el servidor no arranca
const { MONGODB_URI, JWT_SECRET } = process.env;
if (!MONGODB_URI || !JWT_SECRET) {
    console.error('❌ Faltan variables de entorno: MONGODB_URI y JWT_SECRET son obligatorias.');
    process.exit(1);
}
if (JWT_SECRET.length < 32) {
    console.error('❌ JWT_SECRET es demasiado corto: use al menos 32 caracteres aleatorios.');
    process.exit(1);
}

const app = require('./app');
const PORT = process.env.PORT || 3000;

mongoose.connect(MONGODB_URI)
    .then(() => {
        console.log('✅ Base de datos MongoDB conectada exitosamente');

        const servidor = app.listen(PORT, () => {
            console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
        });

        // Cierre ordenado cuando Docker o el usuario apagan el servicio
        const apagar = () => {
            servidor.close(() => {
                mongoose.connection.close().finally(() => process.exit(0));
            });
        };
        process.on('SIGTERM', apagar);
        process.on('SIGINT', apagar);
    })
    .catch((err) => {
        console.error('❌ Error al conectar a MongoDB:', err.message);
        process.exit(1);
    });