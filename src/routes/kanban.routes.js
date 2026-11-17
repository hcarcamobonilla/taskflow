// Rutas de la API del tablero Kanban: asocian cada método y URL con su controlador.

const { Router } = require('express');
const controller = require('../controllers/kanban.controller');

const router = Router();

router.get('/', controller.getBoard);

router.post('/columns', controller.createColumn);
router.put('/columns/:id', controller.updateColumn);
router.patch('/columns/:id/move', controller.moveColumn);
router.delete('/columns/:id', controller.removeColumn);

// Acciones sobre todas las tarjetas de una columna.
router.post('/columns/:id/cards', controller.createCard);
router.delete('/columns/:id/cards', controller.clearColumn);
router.post('/columns/:id/move-cards', controller.moveAllCards);

router.put('/cards/:id', controller.updateCard);
router.patch('/cards/:id/move', controller.moveCard);
router.delete('/cards/:id', controller.removeCard);

module.exports = router;
