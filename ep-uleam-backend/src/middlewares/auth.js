const jwt = require('jsonwebtoken');

const verificarToken = (req, res, next) => {
    // El token debe venir en los headers como: "Bearer <token>"
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ mensaje: 'Acceso denegado. No hay token provisto.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        // Verifica el token usando una clave secreta (debes añadir JWT_SECRET a tu .env)
        const decodificado = jwt.verify(token, process.env.JWT_SECRET);
        req.usuario = decodificado; // Inyecta los datos del usuario en la petición
        next(); // Permite que la petición continúe hacia la ruta
    } catch (error) {
        res.status(401).json({ mensaje: 'Token inválido o expirado.' });
    }
};

const verificarRol = (rolesPermitidos) => {
    return (req, res, next) => {
        if (!req.usuario || !rolesPermitidos.includes(req.usuario.rol)) {
            return res.status(403).json({ mensaje: 'No tienes permisos para realizar esta acción.' });
        }
        next();
    };
};

module.exports = { verificarToken, verificarRol };