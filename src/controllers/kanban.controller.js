// Controladores del tablero Kanban: validan la entrada, llaman al servicio y devuelven
// la respuesta JSON. Los errores lanzados llegan solos al manejador central (Express 5).

const service = require('../services/kanban.service');
const validator = require('../validators/kanban.validator');

async function getBoard(req, res) {
  res.json({ data: await service.getBoard() });
}

async function updateProject(req, res) {
  const input = validator.validateProject(req.body);
  res.json({ data: await service.updateProject(input) });
}

/* ---------- Columnas ---------- */

async function createColumn(req, res) {
  const input = validator.validateNewColumn(req.body);
  const column = await service.createColumn(input);
  res.status(201).json({ data: column });
}

async function duplicateColumn(req, res) {
  const id = validator.parseId(req.params.id);
  res.status(201).json({ data: await service.duplicateColumn(id) });
}

async function updateColumn(req, res) {
  const id = validator.parseId(req.params.id);
  const input = validator.validateColumn(req.body);
  res.json({ data: await service.updateColumn(id, input) });
}

async function moveColumn(req, res) {
  const id = validator.parseId(req.params.id);
  const position = validator.validateColumnMove(req.body);
  res.json({ data: await service.moveColumn(id, position) });
}

async function removeColumn(req, res) {
  const id = validator.parseId(req.params.id);
  await service.removeColumn(id);
  res.status(204).end();
}

async function clearColumn(req, res) {
  const id = validator.parseId(req.params.id);
  await service.clearColumn(id);
  res.status(204).end();
}

async function moveAllCards(req, res) {
  const id = validator.parseId(req.params.id);
  const targetColumnId = validator.validateMoveAllCards(req.body, id);
  res.json({ data: await service.moveAllCards(id, targetColumnId) });
}

/* ---------- Tarjetas ---------- */

async function createCard(req, res) {
  const columnId = validator.parseId(req.params.id);
  const input = validator.validateCard(req.body);
  const card = await service.createCard(columnId, input);
  res.status(201).json({ data: card });
}

async function updateCard(req, res) {
  const id = validator.parseId(req.params.id);
  const input = validator.validateCard(req.body);
  res.json({ data: await service.updateCard(id, input) });
}

async function completeCard(req, res) {
  const id = validator.parseId(req.params.id);
  res.json({ data: await service.completeCard(id) });
}

async function duplicateCard(req, res) {
  const id = validator.parseId(req.params.id);
  res.status(201).json({ data: await service.duplicateCard(id) });
}

async function moveCard(req, res) {
  const id = validator.parseId(req.params.id);
  const move = validator.validateCardMove(req.body);
  res.json({ data: await service.moveCard(id, move) });
}

async function removeCard(req, res) {
  const id = validator.parseId(req.params.id);
  await service.removeCard(id);
  res.status(204).end();
}

module.exports = {
  getBoard,
  updateProject,
  createColumn,
  duplicateColumn,
  updateColumn,
  moveColumn,
  removeColumn,
  clearColumn,
  moveAllCards,
  createCard,
  updateCard,
  completeCard,
  duplicateCard,
  moveCard,
  removeCard,
};
