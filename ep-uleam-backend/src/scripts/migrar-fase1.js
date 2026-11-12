// Renombra el rol "Usuario institucional" a "Funcionario" en los usuarios ya registrados.
// Uso: node src/scripts/migrar-fase1.js
require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
    if (!process.env.MONGODB_URI) {
        console.error('Falta MONGODB_URI en el entorno.');
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGODB_URI);

    const resultado = await mongoose.connection.collection('usuarios').updateMany(
        { roles: 'Usuario institucional' },
        { $set: { 'roles.$[rol]': 'Funcionario' } },
        { arrayFilters: [{ rol: 'Usuario institucional' }] }
    );

    console.log(`Usuarios actualizados: ${resultado.modifiedCount}`);
    console.log('Nota: las entradas antiguas de la bitácora conservan el nombre anterior del rol (son un registro histórico).');

    await mongoose.disconnect();
})().catch((error) => {
    console.error('Error en la migración:', error.message);
    process.exit(1);
});