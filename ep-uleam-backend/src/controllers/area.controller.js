const mongoose = require('mongoose');
const Area = require('../models/Area');
const Usuario = require('../models/Usuario');
const Documento = require('../models/Documento');
const { registrarAccion } = require('../services/bitacora.service');

const TIPOS = ['area', 'unidad'];
const idValido = (id) => mongoose.isValidObjectId(id);

const errorServidor = (res, error, contexto) => {
    console.error(`Error al ${contexto}:`, error);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
};

// Ordena las áreas como árbol (cada una justo debajo de su área superior) con su nivel y su ruta
const construirLista = (areas) => {
    const hijos = new Map();
    areas.forEach((a) => {
        const clave = a.padre ? String(a.padre) : 'raiz';
        if (!hijos.has(clave)) hijos.set(clave, []);
        hijos.get(clave).push(a);
    });

    const resultado = [];
    const recorrer = (clave, nivel, ruta) => {
        (hijos.get(clave) || [])
            .sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'))
            .forEach((a) => {
                const rutaActual = [...ruta, a.nombre];
                resultado.push({ ...a, nivel, ruta: rutaActual.join(' / ') });
                recorrer(String(a._id), nivel + 1, rutaActual);
            });
    };
    recorrer('raiz', 0, []);
    return resultado;
};

// ¿El candidato a área superior es el área misma o una de sus subáreas?
const quedariaDentroDeSi = async (idArea, idCandidato) => {
    let actual = idCandidato;
    while (actual) {
        if (String(actual) === String(idArea)) return true;
        const nodo = await Area.findById(actual).select('padre').lean();
        actual = nodo?.padre ?? null;
    }
    return false;
};

const cargarArea = async (req, res) => {
    if (!idValido(req.params.id)) {
        res.status(404).json({ mensaje: 'Área no encontrada.' });
        return null;
    }
    const area = await Area.findById(req.params.id);
    if (!area) {
        res.status(404).json({ mensaje: 'Área no encontrada.' });
        return null;
    }
    return area;
};

const leerPadre = async (valor) => {
    if (!valor) return { padre: null };
    if (!idValido(valor)) return { error: 'El área superior no es válida.' };
    const padre = await Area.findById(valor);
    if (!padre || !padre.activa) return { error: 'El área superior no existe o está inactiva.' };
    return { padre };
};

// ---------- Listar ----------
// Cualquier usuario recibe las áreas activas (para las listas de selección).
// Con ?todas=1 y el permiso areas.gestionar se incluyen las inactivas y los totales.

const listarAreas = async (req, res) => {
    try {
        const verTodas = req.query.todas === '1';
        if (verTodas && !req.usuario.permisos.includes('areas.gestionar')) {
            return res.status(403).json({ mensaje: 'No tiene permisos para ver las áreas inactivas.' });
        }

        const areas = await Area.find().lean();
        let lista = construirLista(areas);

        if (!verTodas) {
            lista = lista.filter((a) => a.activa);
        } else {
            const filas = await Usuario.aggregate([{ $group: { _id: '$departamento', total: { $sum: 1 } } }]);
            const usuarios = Object.fromEntries(filas.map((f) => [f._id, f.total]));
            lista = lista.map((a) => ({
                ...a,
                usuarios: usuarios[a.nombre] || 0,
                hijos: areas.filter((x) => String(x.padre) === String(a._id)).length
            }));
        }

        res.json(lista.map(({ claveNombre, createdAt, updatedAt, ...resto }) => resto));
    } catch (error) {
        errorServidor(res, error, 'listar las áreas');
    }
};

// ---------- Crear ----------

const crearArea = async (req, res) => {
    try {
        const nombre = String(req.body?.nombre || '').trim();
        const siglas = String(req.body?.siglas || '').trim().toUpperCase().slice(0, 12);
        const tipo = TIPOS.includes(req.body?.tipo) ? req.body.tipo : 'area';

        if (nombre.length < 2 || nombre.length > 80) {
            return res.status(400).json({ mensaje: 'El nombre del área debe tener entre 2 y 80 caracteres.' });
        }
        const { padre, error } = await leerPadre(req.body?.padre);
        if (error) {
            return res.status(400).json({ mensaje: error });
        }

        const area = await Area.create({ nombre, siglas, tipo, padre: padre ? padre._id : null });

        await registrarAccion({
            accion: 'AREA_CREADA',
            usuario: req.usuario,
            detalle: `${area.nombre}${padre ? ` (dentro de ${padre.nombre})` : ''}`
        });

        res.status(201).json({ mensaje: 'Área creada.', area: { _id: area._id, nombre: area.nombre } });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ mensaje: 'Ya existe un área con ese nombre.' });
        }
        errorServidor(res, error, 'crear el área');
    }
};

// ---------- Editar ----------

const editarArea = async (req, res) => {
    try {
        const area = await cargarArea(req, res);
        if (!area) return;

        const cambios = [];
        const nombreAnterior = area.nombre;
        let renombrada = false;

        if (req.body?.nombre !== undefined) {
            const nuevo = String(req.body.nombre).trim();
            if (nuevo.length < 2 || nuevo.length > 80) {
                return res.status(400).json({ mensaje: 'El nombre del área debe tener entre 2 y 80 caracteres.' });
            }
            if (nuevo !== area.nombre) {
                cambios.push(`nombre: "${area.nombre}" → "${nuevo}"`);
                area.nombre = nuevo;
                renombrada = true;
            }
        }

        if (req.body?.siglas !== undefined) {
            const nuevas = String(req.body.siglas).trim().toUpperCase().slice(0, 12);
            if (nuevas !== area.siglas) {
                cambios.push(`siglas: "${area.siglas}" → "${nuevas}"`);
                area.siglas = nuevas;
            }
        }

        if (req.body?.tipo !== undefined) {
            if (!TIPOS.includes(req.body.tipo)) {
                return res.status(400).json({ mensaje: 'El tipo de área no es válido.' });
            }
            if (req.body.tipo !== area.tipo) {
                cambios.push(`tipo: ${area.tipo} → ${req.body.tipo}`);
                area.tipo = req.body.tipo;
            }
        }

        if (req.body?.padre !== undefined) {
            const { padre, error } = await leerPadre(req.body.padre);
            if (error) {
                return res.status(400).json({ mensaje: error });
            }
            const idPadre = padre ? padre._id : null;
            if (String(idPadre ?? '') !== String(area.padre ?? '')) {
                if (idPadre && (await quedariaDentroDeSi(area._id, idPadre))) {
                    return res.status(400).json({ mensaje: 'Un área no puede quedar dentro de sí misma ni de sus subáreas.' });
                }
                cambios.push(`área superior: ${padre ? padre.nombre : 'ninguna'}`);
                area.padre = idPadre;
            }
        }

        if (req.body?.activa !== undefined && Boolean(req.body.activa) !== area.activa) {
            if (!req.body.activa) {
                const usuarios = await Usuario.countDocuments({ departamento: nombreAnterior, estado: true });
                const hijosActivos = await Area.countDocuments({ padre: area._id, activa: true });
                if (usuarios > 0 || hijosActivos > 0) {
                    return res.status(409).json({
                        mensaje: `No se puede desactivar: tiene ${usuarios} usuario(s) activo(s) y ${hijosActivos} subárea(s) activa(s).`
                    });
                }
            } else if (area.padre) {
                const padre = await Area.findById(area.padre);
                if (!padre || !padre.activa) {
                    return res.status(409).json({ mensaje: 'No se puede activar: su área superior está inactiva.' });
                }
            }
            cambios.push(req.body.activa ? 'activada' : 'desactivada');
            area.activa = Boolean(req.body.activa);
        }

        if (cambios.length === 0) {
            return res.status(400).json({ mensaje: 'No hay cambios para guardar.' });
        }

        await area.save();

        // Los usuarios y los documentos guardan el nombre del área: se actualizan al renombrarla
        if (renombrada) {
            await Usuario.updateMany({ departamento: nombreAnterior }, { departamento: area.nombre });
            await Documento.updateMany(
                { 'remitente.departamento': nombreAnterior },
                { $set: { 'remitente.departamento': area.nombre } }
            );
            await Documento.updateMany(
                { 'destinatario.departamento': nombreAnterior },
                { $set: { 'destinatario.departamento': area.nombre } }
            );
        }

        await registrarAccion({
            accion: 'AREA_MODIFICADA',
            usuario: req.usuario,
            detalle: `${nombreAnterior} · ${cambios.join(' · ')}`
        });

        res.json({ mensaje: 'Área actualizada.' });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ mensaje: 'Ya existe un área con ese nombre.' });
        }
        errorServidor(res, error, 'actualizar el área');
    }
};

// ---------- Eliminar ----------

const eliminarArea = async (req, res) => {
    try {
        const area = await cargarArea(req, res);
        if (!area) return;

        const usuarios = await Usuario.countDocuments({ departamento: area.nombre });
        const hijos = await Area.countDocuments({ padre: area._id });
        const documentos = await Documento.countDocuments({
            $or: [{ 'remitente.departamento': area.nombre }, { 'destinatario.departamento': area.nombre }]
        });

        if (usuarios > 0 || hijos > 0 || documentos > 0) {
            return res.status(409).json({
                mensaje: `No se puede eliminar: tiene ${usuarios} usuario(s), ${hijos} subárea(s) y ${documentos} documento(s) relacionados. Puede desactivarla.`
            });
        }

        await Area.deleteOne({ _id: area._id });
        await registrarAccion({ accion: 'AREA_ELIMINADA', usuario: req.usuario, detalle: area.nombre });

        res.json({ mensaje: 'Área eliminada.' });
    } catch (error) {
        errorServidor(res, error, 'eliminar el área');
    }
};

module.exports = { listarAreas, crearArea, editarArea, eliminarArea };