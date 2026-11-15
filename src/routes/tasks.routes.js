// Rutas de la API de tareas: asocian cada método y URL con su controlador.

const { Router } = require('express');
const controller = require('../controllers/tasks.controller');

const router = Router();

router.get('/', controller.list);
router.get('/:id', controller.getOne);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.patch('/:id/status', controller.updateStatus);
router.delete('/:id', controller.remove);

module.exports = router;
