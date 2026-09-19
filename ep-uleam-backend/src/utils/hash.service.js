// src/utils/hash.service.js
const crypto = require('crypto');
const fs = require('fs');

const generarHash = (datos, hashAnterior, rutaArchivo = null) => {
    // 1. Extraemos los metadatos principales como cadena de texto
    const dataString = `${datos.codigoTramite}${datos.tipoDocumento}${datos.asunto}${hashAnterior}`;
    
    // 2. Inicializamos el motor SHA-256
    const hash = crypto.createHash('sha256');
    hash.update(dataString);

    // 3. NÚCLEO DE LA TESIS: Si hay un archivo físico, lo leemos en binario y lo sumamos a la firma
    if (rutaArchivo && fs.existsSync(rutaArchivo)) {
        const fileBuffer = fs.readFileSync(rutaArchivo);
        hash.update(fileBuffer);
    }
    
    return hash.digest('hex');
};

module.exports = { generarHash };