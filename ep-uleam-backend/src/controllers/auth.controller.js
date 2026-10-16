const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const Usuario = require('../models/Usuario');
const { registrarAccion } = require('../services/bitacora.service');
const { armarSesion } = require('../utils/sesion');
const { validarPassword } = require('../utils/password.util');

const MAX_INTENTOS = 3;

// El token lleva el momento de emisión (en milisegundos) para poder invalidar sesiones anteriores
const firmarToken = (usuario, emitido = Date.now()) =>
    jwt.sign({ id: String(usuario._id), emitido }, process.env.JWT_SECRET, { expiresIn: '8h' });

const limpiarEmail = (valor) => String(valor || '').trim().toLowerCase();

// ---------- CU-01: Iniciar sesión ----------

const login = async (req, res) => {
    try {
        const email = limpiarEmail(req.body?.email);
        const password = String(req.body?.password || '');

        if (!email || !password) {
            return res.status(400).json({ mensaje: 'Ingrese su correo y su contraseña.' });
        }

        const usuario = await Usuario.findOne({ email });
        if (!usuario) {
            return res.status(401).json({ mensaje: 'Credenciales inválidas.' });
        }
        if (!usuario.estado) {
            return res.status(403).json({ mensaje: 'Cuenta inactiva. Contacte a Gerencia o TIC.' });
        }
        if (usuario.bloqueado) {
            return res.status(423).json({
                mensaje: 'Su cuenta está bloqueada por intentos fallidos. Comuníquese con Gerencia o TIC para recibir una clave temporal.'
            });
        }

        if (!(await usuario.compararPassword(password))) {
            usuario.intentosFallidos += 1;
            const restantes = MAX_INTENTOS - usuario.intentosFallidos;

            if (restantes <= 0) {
                usuario.bloqueado = true;
                usuario.bloqueadoEn = new Date();
            }
            await usuario.save();

            const sesion = armarSesion(usuario);
            await registrarAccion({
                accion: 'LOGIN_FALLIDO',
                usuario: sesion,
                detalle: `Intento fallido ${usuario.intentosFallidos} de ${MAX_INTENTOS}`
            });

            if (usuario.bloqueado) {
                await registrarAccion({
                    accion: 'CUENTA_BLOQUEADA',
                    usuario: sesion,
                    detalle: `Bloqueo automático tras ${MAX_INTENTOS} intentos fallidos`
                });
                return res.status(423).json({
                    mensaje: 'Superó los 3 intentos permitidos y su cuenta fue bloqueada. Comuníquese con Gerencia o TIC para recibir una clave temporal.'
                });
            }

            return res.status(401).json({
                mensaje: `Credenciales inválidas. ${restantes === 1 ? 'Le queda 1 intento' : `Le quedan ${restantes} intentos`}.`,
                intentosRestantes: restantes
            });
        }

        usuario.intentosFallidos = 0;
        usuario.ultimoAcceso = new Date();
        usuario.ultimaActividad = new Date();
        await usuario.save();

        const sesion = armarSesion(usuario);
        await registrarAccion({ accion: 'INICIO_SESION', usuario: sesion, detalle: '' });

        res.json({
            mensaje: 'Autenticación exitosa',
            token: firmarToken(usuario),
            usuario: sesion
        });
    } catch (error) {
        console.error('Error en el login:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
};

// ---------- CU-02: Recuperar contraseña ----------
// El usuario deja una solicitud pendiente; Gerencia o TIC generan la clave temporal.

const solicitarRecuperacion = async (req, res) => {
    try {
        const email = limpiarEmail(req.body?.email);
        if (!email) {
            return res.status(400).json({ mensaje: 'Ingrese su correo institucional.' });
        }

        const usuario = await Usuario.findOne({ email });
        if (!usuario) {
            return res.status(404).json({ mensaje: 'El correo ingresado no se encuentra registrado.' });
        }
        if (!usuario.estado) {
            return res.status(403).json({
                mensaje: 'Su cuenta se encuentra inactiva. La gestión debe realizarla Gerencia o TIC.'
            });
        }

        if (!usuario.solicitoRecuperacion) {
            usuario.solicitoRecuperacion = true;
            usuario.solicitudRecuperacionEn = new Date();
            await usuario.save();

            await registrarAccion({
                accion: 'SOLICITUD_RECUPERACION',
                usuario: armarSesion(usuario),
                detalle: 'Solicitud de clave temporal'
            });
        }

        res.json({ mensaje: 'Su solicitud fue enviada a Gerencia y TIC. Ellos le entregarán una clave temporal.' });
    } catch (error) {
        console.error('Error al solicitar la recuperación:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
};

// ---------- Cambiar contraseña (CU-02 paso 6 y CU-04 paso 6) ----------

const cambiarPassword = async (req, res) => {
    try {
        const { passwordActual, passwordNueva } = req.body || {};

        if (!passwordActual || !passwordNueva) {
            return res.status(400).json({ mensaje: 'Ingrese la contraseña actual y la nueva.' });
        }
        if (passwordActual === passwordNueva) {
            return res.status(400).json({ mensaje: 'La nueva contraseña debe ser distinta de la actual.' });
        }
        const errorPassword = validarPassword(passwordNueva);
        if (errorPassword) {
            return res.status(400).json({ mensaje: errorPassword });
        }

        const usuario = await Usuario.findById(req.usuario.id);
        if (!(await usuario.compararPassword(passwordActual))) {
            return res.status(400).json({ mensaje: 'La contraseña actual no es correcta.' });
        }

        // Las demás sesiones abiertas dejan de valer; se entrega un token nuevo
        const ahora = Date.now();
        usuario.password = passwordNueva;
        usuario.debeCambiarPassword = false;
        usuario.tokenValidoDesde = new Date(ahora);
        usuario.ultimaActividad = new Date(ahora);
        await usuario.save();

        const sesion = armarSesion(usuario);
        await registrarAccion({ accion: 'CAMBIO_PASSWORD', usuario: sesion, detalle: '' });

        res.json({
            mensaje: 'Contraseña actualizada.',
            token: firmarToken(usuario, ahora),
            usuario: sesion
        });
    } catch (error) {
        console.error('Error al cambiar la contraseña:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
};

// ---------- CU-03: Cerrar sesión ----------

const cerrarSesion = async (req, res) => {
    try {
        const motivo = req.body?.motivo === 'inactividad' ? 'por inactividad' : 'manual';

        await Usuario.updateOne({ _id: req.usuario.id }, { tokenValidoDesde: new Date() });
        await registrarAccion({
            accion: 'CIERRE_SESION',
            usuario: req.usuario,
            detalle: `Cierre ${motivo}`
        });

        res.json({ mensaje: 'Sesión cerrada.' });
    } catch (error) {
        console.error('Error al cerrar la sesión:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
};

// ---------- Perfil actual (el frontend lo usa también como "latido" de actividad) ----------

const perfil = (req, res) => {
    res.json(req.usuario);
};

// ---------- Primer Superadmin (protegido con SETUP_KEY) ----------

const llaveValida = (recibida) => {
    const esperada = process.env.SETUP_KEY || '';
    if (!esperada || typeof recibida !== 'string') {
        return false;
    }
    const a = Buffer.from(recibida);
    const b = Buffer.from(esperada);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const registrarAdminInicial = async (req, res) => {
    try {
        if (!process.env.SETUP_KEY) {
            return res.status(503).json({ mensaje: 'El registro inicial no está habilitado: falta SETUP_KEY en el servidor.' });
        }
        if (!llaveValida(req.header('x-setup-key'))) {
            return res.status(403).json({ mensaje: 'Llave de instalación incorrecta.' });
        }
        if ((await Usuario.countDocuments()) > 0) {
            return res.status(409).json({ mensaje: 'El sistema ya fue inicializado.' });
        }

        const { cedula, nombres, apellidos, email, departamento, password } = req.body || {};
        const campos = [cedula, nombres, apellidos, email, departamento];
        if (!campos.every((c) => typeof c === 'string' && c.trim() !== '')) {
            return res.status(400).json({ mensaje: 'Complete todos los datos del Superadmin.' });
        }
        const errorPassword = validarPassword(password);
        if (errorPassword) {
            return res.status(400).json({ mensaje: errorPassword });
        }

        const admin = await Usuario.create({
            cedula: cedula.trim(),
            nombres: nombres.trim(),
            apellidos: apellidos.trim(),
            email: limpiarEmail(email),
            departamento: departamento.trim(),
            password,
            roles: ['Superadmin']
        });

        await registrarAccion({
            accion: 'USUARIO_REGISTRADO',
            usuario: { nombre: 'Sistema', rol: 'Sistema' },
            detalle: `Superadmin inicial: ${admin.email}`
        });

        res.status(201).json({ mensaje: 'Superadmin inicial creado con éxito.' });
    } catch (error) {
        console.error('Error al registrar el Superadmin inicial:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
};

module.exports = {
    login,
    solicitarRecuperacion,
    cambiarPassword,
    cerrarSesion,
    perfil,
    registrarAdminInicial
};