// src/index.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');

const app = express();

app.use(express.json()); 

const documentoRoutes = require('./routes/documentos.routes');
app.use('/api/documentos', documentoRoutes);

app.get('/', (req, res) => {
    res.send('API de Gestión Documental EP-ULEAM funcionando correctamente.');
});

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

mongoose.connect(MONGODB_URI)
    .then(() => {
        console.log('✅ Conectado a MongoDB exitosamente');
        app.listen(PORT, () => {
            console.log(`🚀 Servidor backend levantado en http://localhost:${PORT}`);
        });
    })
    .catch((error) => {
        console.error('❌ Error fatal al conectar a MongoDB:', error);
    });