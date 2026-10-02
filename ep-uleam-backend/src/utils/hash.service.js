// src/utils/hash.service.js
const crypto = require('crypto');
const fs = require('fs');

// Hash anterior de la primera entrada de la bitácora (bloque génesis)
const HASH_GENESIS = '0'.repeat(64);

const sha256 = (texto) => crypto.createHash('sha256').update(texto).digest('hex');

// SHA-256 del contenido binario de un archivo (CU-19)
const hashArchivo = (ruta) => new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const lectura = fs.createReadStream(ruta);
    lectura.on('error', reject);
    lectura.on('data', (fragmento) => hash.update(fragmento));
    lectura.on('end', () => resolve(hash.digest('hex')));
});

// SHA-256 de una entrada de bitácora, enlazada con el hash de la entrada anterior.
// El orden y el separador '|' son fijos: cambiarlos invalida las entradas ya guardadas.
const hashEntrada = (entrada, hashAnterior) => {
    return sha256([
        hashAnterior,
        new Date(entrada.fecha).toISOString(),
        entrada.accion,
        entrada.documento ? String(entrada.documento) : '',
        entrada.codigoTramite || '',
        entrada.usuario.id || '',
        entrada.usuario.nombre || '',
        entrada.usuario.rol || '',
        entrada.detalle || ''
    ].join('|'));
};

module.exports = { HASH_GENESIS, hashArchivo, hashEntrada };