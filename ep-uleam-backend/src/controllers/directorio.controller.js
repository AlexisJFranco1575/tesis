const Usuario = require('../models/Usuario');
const { resolverArea } = require('../services/catalogo.service');
const { normalizar } = require('../utils/acceso');

// GET /api/directorio?area=Contabilidad&texto=ana
// Personas activas, para elegir destinatarios sin escribir. No expone datos de contacto ni de acceso.
const listarDirectorio = async (req, res) => {
    try {
        const filtro = { estado: true };

        if (req.query.area) {
            const area = await resolverArea(req.query.area);
            if (!area) {
                return res.json([]);
            }
            filtro.departamento = area.nombre;
        }

        const usuarios = await Usuario.find(filtro)
            .select('nombres apellidos departamento')
            .sort({ departamento: 1, apellidos: 1, nombres: 1 })
            .limit(500)
            .lean();

        const buscado = normalizar(String(req.query.texto || ''));
        const personas = usuarios
            .map((u) => ({ id: String(u._id), nombre: `${u.nombres} ${u.apellidos}`, departamento: u.departamento }))
            .filter((p) => !buscado || normalizar(p.nombre).includes(buscado));

        res.json(personas);
    } catch (error) {
        console.error('Error al consultar el directorio:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
};

module.exports = { listarDirectorio };