// Prepara una base de datos existente para la Fase 3 (trámite entre personas).
// Uso: node src/scripts/migrar-fase3.js   (después, reinicie la API para que cargue los roles)
require('dotenv').config();
const mongoose = require('mongoose');
const Rol = require('../models/Rol');
const Documento = require('../models/Documento');
const { PERMISOS_OPERATIVOS } = require('../config/roles');
const { inicializarCatalogos } = require('../services/catalogo.service');

// Permisos que se agregan a cada rol base. Los roles creados por el administrador no se tocan.
const NUEVOS_PERMISOS = {
    Gerencia: PERMISOS_OPERATIVOS,
    TIC: ['documentos.enviar'],
    'Secretaría': ['documentos.enviar'],
    Funcionario: ['documentos.enviar']
};

(async () => {
    if (!process.env.MONGODB_URI) {
        console.error('Falta MONGODB_URI en el entorno.');
        process.exit(1);
    }
    await mongoose.connect(process.env.MONGODB_URI);
    await inicializarCatalogos();

    for (const [nombre, permisos] of Object.entries(NUEVOS_PERMISOS)) {
        const r = await Rol.updateOne({ nombre, sistema: true }, { $addToSet: { permisos: { $each: permisos } } });
        console.log(`Rol ${nombre}: ${r.modifiedCount > 0 ? 'permisos agregados' : 'sin cambios'}`);
    }

    // El creador de cada documento debe figurar entre los usuarios que intervienen
    const documentos = await Documento.find({
        $or: [{ involucrados: { $exists: false } }, { involucrados: { $size: 0 } }]
    }).select('creadoPor');

    let actualizados = 0;
    for (const d of documentos) {
        if (d.creadoPor?.id) {
            await Documento.updateOne({ _id: d._id }, { $set: { involucrados: [d.creadoPor.id] } });
            actualizados += 1;
        }
    }
    console.log(`Documentos actualizados: ${actualizados}`);
    console.log('\nListo. Reinicie la API para que cargue los roles actualizados.');

    await mongoose.disconnect();
})().catch((error) => {
    console.error('Error en la migración:', error.message);
    process.exit(1);
});