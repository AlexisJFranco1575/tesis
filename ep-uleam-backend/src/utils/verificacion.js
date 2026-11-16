// Enlace público de verificación de autenticidad de un documento.
// Lleva una clave derivada (HMAC) del código de trámite: sin ella no se puede consultar,
// así que los documentos no se pueden recorrer probando códigos consecutivos.
const crypto = require('crypto');

const baseUrl = () => String(process.env.URL_PUBLICA || 'http://localhost:4200').replace(/\/+$/, '');

const secreto = () => process.env.VERIFICACION_SECRET || process.env.JWT_SECRET || 'secreto-solo-para-desarrollo';

const claveDe = (codigo) =>
    crypto.createHmac('sha256', secreto()).update(String(codigo).toUpperCase()).digest('hex').slice(0, 12);

const claveValida = (codigo, clave) => {
    const esperada = Buffer.from(claveDe(codigo));
    const recibida = Buffer.from(String(clave || ''));
    return esperada.length === recibida.length && crypto.timingSafeEqual(esperada, recibida);
};

const enlaceDeVerificacion = (codigo) => `${baseUrl()}/verificar/${encodeURIComponent(codigo)}?k=${claveDe(codigo)}`;

module.exports = { claveDe, claveValida, enlaceDeVerificacion };