const express = require('express');
const router = express.Router();
const { verificarToken, requierePermiso } = require('../middlewares/auth');
const { listarAreas, crearArea, editarArea, eliminarArea } = require('../controllers/area.controller');

router.use(verificarToken);

// Cualquier usuario autenticado puede leer las áreas activas (para las listas de selección)
router.get('/', listarAreas);

router.post('/', requierePermiso('areas.gestionar'), crearArea);
router.patch('/:id', requierePermiso('areas.gestionar'), editarArea);
router.delete('/:id', requierePermiso('areas.gestionar'), eliminarArea);

module.exports = router;