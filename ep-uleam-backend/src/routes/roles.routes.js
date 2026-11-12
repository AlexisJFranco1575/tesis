const express = require('express');
const router = express.Router();
const { verificarToken, requierePermiso } = require('../middlewares/auth');
const { listarRoles, crearRol, editarRol, eliminarRol } = require('../controllers/rol.controller');

router.use(verificarToken);

const administra = ['usuarios.gestionar', 'roles.gestionar', 'permisos.gestionar'];
router.get('/', requierePermiso(...administra), listarRoles);
router.post('/', requierePermiso('roles.gestionar'), crearRol);
router.patch('/:id', requierePermiso('roles.gestionar'), editarRol);
router.delete('/:id', requierePermiso('roles.gestionar'), eliminarRol);

module.exports = router;