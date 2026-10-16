const express = require('express');
const router = express.Router();
const { verificarToken, requierePermiso } = require('../middlewares/auth');
const {
    obtenerCatalogo,
    listarUsuarios,
    crearUsuario,
    darDeBaja,
    reactivarUsuario,
    cambiarRoles,
    cambiarPermisos,
    generarClave
} = require('../controllers/usuario.controller');

router.use(verificarToken);

// Ver la lista y el catálogo: cualquiera de los tres permisos de administración
const administra = ['usuarios.gestionar', 'roles.gestionar', 'permisos.gestionar'];
router.get('/catalogo', requierePermiso(...administra), obtenerCatalogo);
router.get('/', requierePermiso(...administra), listarUsuarios);

router.post('/', requierePermiso('usuarios.gestionar'), crearUsuario);
router.patch('/:id/baja', requierePermiso('usuarios.gestionar'), darDeBaja);
router.patch('/:id/reactivar', requierePermiso('usuarios.gestionar'), reactivarUsuario);
router.post('/:id/clave-temporal', requierePermiso('usuarios.gestionar'), generarClave);

router.patch('/:id/roles', requierePermiso('roles.gestionar'), cambiarRoles);
router.patch('/:id/permisos', requierePermiso('permisos.gestionar'), cambiarPermisos);

module.exports = router;