// Bloqueo temporal de cuentas por intentos fallidos (RF-01).
// Duración configurable con BLOQUEO_MINUTOS (por defecto, 15).

const duracionBloqueoMs = () => (Number(process.env.BLOQUEO_MINUTOS) || 15) * 60 * 1000;

const minutosDeBloqueo = () => Math.round(duracionBloqueoMs() / 60000);

// Momento en que termina el bloqueo (null si la cuenta no tiene fecha de bloqueo)
const bloqueadoHasta = (usuario) =>
    usuario.bloqueadoEn ? new Date(usuario.bloqueadoEn.getTime() + duracionBloqueoMs()) : null;

// ¿Sigue vigente el bloqueo? Un bloqueo antiguo, sin fecha, se considera vencido:
// así ninguna cuenta bloqueada antes de este cambio queda atrapada para siempre.
const bloqueoVigente = (usuario) => {
    if (!usuario.bloqueado || !usuario.bloqueadoEn) {
        return false;
    }
    return Date.now() < bloqueadoHasta(usuario).getTime();
};

// Texto para el usuario: "en 12 minutos"
const textoTiempoRestante = (usuario) => {
    const minutos = Math.max(1, Math.ceil((bloqueadoHasta(usuario).getTime() - Date.now()) / 60000));
    return minutos === 1 ? 'en 1 minuto' : `en ${minutos} minutos`;
};

module.exports = { duracionBloqueoMs, minutosDeBloqueo, bloqueadoHasta, bloqueoVigente, textoTiempoRestante };