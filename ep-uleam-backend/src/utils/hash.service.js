
const crypto = require('crypto');

const generarHash = (datos, hashAnterior) => {
    // Concatenamos los datos vitales del documento + el hash del documento anterior
    const dataString = `${datos.codigoTramite}${datos.tipoDocumento}${datos.asunto}${datos.remitente.nombre}${datos.destinatario.nombre}${hashAnterior}`;
    
    //hash SHA-256
    return crypto.createHash('sha256').update(dataString).digest('hex');
};

module.exports = { generarHash };