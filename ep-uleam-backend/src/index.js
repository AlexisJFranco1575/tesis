const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

// 1. IMPORTA LA RUTA AQUÍ ARRIBA
const authRoutes = require('./routes/authRoutes');
// const documentoRoutes = require('./routes/documentoRoutes'); // (Cuando la creemos bien)

const app = express();

// MIDDLEWARES (Esto debe ir antes de las rutas sí o sí)
app.use(cors());
app.use(express.json());

// 2. PON EL app.use EXACTAMENTE AQUÍ
app.use('/api/auth', authRoutes);


// Conexión a MongoDB (Usa la variable de tu .env)
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Base de datos MongoDB conectada exitosamente'))
  .catch(err => console.error('❌ Error al conectar a MongoDB:', err));

// Levantar el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
});