const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Usuario = require('../models/Usuario');

// POST: /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const usuario = await Usuario.findOne({ email });
        if (!usuario) {
            return res.status(400).json({ mensaje: 'Credenciales inválidas' });
        }

        if (!usuario.estado) {
            return res.status(403).json({ mensaje: 'Usuario inactivo. Contacte al administrador.' });
        }

        const passwordValido = await usuario.compararPassword(password);
        if (!passwordValido) {
            return res.status(400).json({ mensaje: 'Credenciales inválidas' });
        }

        const payload = {
            id: usuario._id,
            nombreCompleto: `${usuario.nombres} ${usuario.apellidos}`,
            rol: usuario.rol,
            departamento: usuario.departamento
        };

        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' });

        res.json({
            mensaje: 'Autenticación exitosa',
            token,
            usuario: payload
        });

    } catch (error) {
        console.error("Error detectado en login:", error);
        res.status(500).json({ error: error.message });
    }
});

// POST: /api/auth/registrar-admin-inicial
router.post('/registrar-admin-inicial', async (req, res) => {
    try {
        const adminExiste = await Usuario.findOne({ rol: 'Administrador' });
        if (adminExiste) {
            return res.status(400).json({ mensaje: 'Ya existe un administrador en el sistema' });
        }

        const nuevoAdmin = new Usuario(req.body);
        await nuevoAdmin.save(); // Al ejecutar esto, Mongoose procesará el 'pre save' sin crashear
        
        res.status(201).json({ mensaje: 'Administrador inicial creado con éxito' });
    } catch (error) {
        console.error("Error detectado en registro:", error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;