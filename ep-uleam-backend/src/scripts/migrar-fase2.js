// Alinea los nombres de área de usuarios y documentos existentes con el catálogo de áreas.
//   node src/scripts/migrar-fase2.js             → solo muestra el plan
//   node src/scripts/migrar-fase2.js --aplicar   → aplica los cambios
require('dotenv').config();
const mongoose = require('mongoose');
const Area = require('../models/Area');
const Usuario = require('../models/Usuario');
const Documento = require('../models/Documento');
const { inicializarCatalogos } = require('../services/catalogo.service');
const { normalizar } = require('../utils/acceso');

const APLICAR = process.argv.includes('--aplicar');

// Nombres antiguos o abreviados → área del catálogo (claves sin tildes ni mayúsculas)
const ALIAS = {
    tic: 'Tecnologías de la Información',
    ti: 'Tecnologías de la Información',
    tecnologia: 'Tecnologías de la Información',
    sistemas: 'Tecnologías de la Información',
    'recursos humanos': 'Talento Humano',
    rrhh: 'Talento Humano',
    secretaria: 'Secretaría General',
    gerencia: 'Gerencia General',
    financiero: 'Área Financiera',
    financiera: 'Área Financiera'
};

(async () => {
    if (!process.env.MONGODB_URI) {
        console.error('Falta MONGODB_URI en el entorno.');
        process.exit(1);
    }
    await mongoose.connect(process.env.MONGODB_URI);
    await inicializarCatalogos();

    const areas = await Area.find().lean();
    const porClave = new Map(areas.map((a) => [a.claveNombre, a.nombre]));

    const resolver = (texto) => {
        const clave = normalizar(texto);
        if (porClave.has(clave)) return porClave.get(clave);
        const alias = ALIAS[clave];
        return alias && porClave.has(normalizar(alias)) ? alias : null;
    };

    const enUsuarios = await Usuario.aggregate([{ $group: { _id: '$departamento', n: { $sum: 1 } } }]);
    const enDocumentos = await Documento.aggregate([
        { $project: { d: ['$remitente.departamento', '$destinatario.departamento'] } },
        { $unwind: '$d' },
        { $group: { _id: '$d', n: { $sum: 1 } } }
    ]);

    const nombres = new Set([...enUsuarios.map((f) => f._id), ...enDocumentos.map((f) => f._id)]);
    const contar = (lista, nombre) => lista.find((f) => f._id === nombre)?.n || 0;

    const cambios = [];
    const sinEquivalente = [];

    for (const nombre of nombres) {
        const destino = resolver(nombre);
        const usuarios = contar(enUsuarios, nombre);
        const documentos = contar(enDocumentos, nombre);

        if (destino === null) {
            sinEquivalente.push({ nombre, usuarios, documentos });
        } else if (destino !== nombre) {
            cambios.push({ nombre, destino, usuarios, documentos });
        }
    }

    console.log(APLICAR ? '\n== APLICANDO CAMBIOS ==' : '\n== PLAN (no se cambia nada; use --aplicar) ==');
    cambios.forEach((c) => console.log(`  "${c.nombre}" → "${c.destino}"  (${c.usuarios} usuario(s), ${c.documentos} mención(es) en documentos)`));
    if (cambios.length === 0) console.log('  No hay nombres para ajustar.');

    if (sinEquivalente.length > 0) {
        console.log('\nSin equivalente en el catálogo (revíselos desde la pantalla Usuarios → cambiar área):');
        sinEquivalente.forEach((s) => console.log(`  "${s.nombre}"  (${s.usuarios} usuario(s), ${s.documentos} mención(es) en documentos)`));
    }

    if (APLICAR) {
        for (const c of cambios) {
            await Usuario.updateMany({ departamento: c.nombre }, { departamento: c.destino });
            await Documento.updateMany({ 'remitente.departamento': c.nombre }, { $set: { 'remitente.departamento': c.destino } });
            await Documento.updateMany({ 'destinatario.departamento': c.nombre }, { $set: { 'destinatario.departamento': c.destino } });
        }
        console.log('\nListo.');
    }

    await mongoose.disconnect();
})().catch((error) => {
    console.error('Error en la migración:', error.message);
    process.exit(1);
});