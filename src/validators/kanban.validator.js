// Validación de la entrada del tablero Kanban (columnas, tarjetas y movimientos).
// Cada función devuelve datos limpios o lanza HttpError 400 con el detalle por campo.
//
// Estas mismas reglas existen para el modo invitado en public/js/store/kanbanRules.js.
// Si se cambia una, hay que cambiar la otra (tests/store-parity.test.js lo comprueba).

const HttpError = require('../utils/HttpError');
const { PRIORITIES, isValidDate, parseId } = require('./tasks.validator');

// Topes fijos del tablero: mantienen el tablero legible y acotan su tamaño.
const MAX_COLUMNS = 8;
const MAX_CARDS_PER_COLUMN = 50;

const NAME_MAX = 60;
const TITLE_MAX = 150;
const DESCRIPTION_MAX = 2000;
const MAX_INT = 2147483647; // límite del tipo INTEGER de PostgreSQL

const POSITION_MESSAGE = 'La posición debe ser un número entero mayor o igual que 0';
const TARGET_REQUIRED_MESSAGE = 'La columna de destino es obligatoria';

function fail(details) {
  throw new HttpError(400, 'Datos de entrada no válidos', details);
}

function isEmpty(value) {
  return value === undefined || value === null || value === '';
}

function requireObject(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    fail([{ field: 'body', message: 'El cuerpo debe ser un objeto JSON' }]);
  }
}

function isPosition(value) {
  return Number.isInteger(value) && value >= 0 && value <= MAX_INT;
}

// Valida un id que llega en el cuerpo de la petición (los de la URL usan parseId).
function parseBodyId(value, field) {
  if (isEmpty(value)) fail([{ field, message: TARGET_REQUIRED_MESSAGE }]);
  const isIdLike = (typeof value === 'number' || typeof value === 'string') && /^\d+$/.test(String(value));
  const id = Number(value);
  if (!isIdLike || id < 1 || id > MAX_INT) {
    fail([{ field, message: 'El id debe ser un entero positivo' }]);
  }
  return id;
}

// Columna (POST y PUT): nombre obligatorio y límite WIP opcional (null = sin límite).
function validateColumn(body) {
  requireObject(body);
  const errors = [];
  const column = {};

  if (typeof body.name !== 'string' || body.name.trim() === '') {
    errors.push({ field: 'name', message: 'El nombre de la columna es obligatorio' });
  } else if (body.name.trim().length > NAME_MAX) {
    errors.push({ field: 'name', message: `El nombre admite como máximo ${NAME_MAX} caracteres` });
  } else {
    column.name = body.name.trim();
  }

  if (isEmpty(body.wipLimit)) {
    column.wipLimit = null;
  } else if (!Number.isInteger(body.wipLimit) || body.wipLimit < 1 || body.wipLimit > MAX_CARDS_PER_COLUMN) {
    errors.push({ field: 'wipLimit', message: `El límite WIP debe ser un número entero entre 1 y ${MAX_CARDS_PER_COLUMN}` });
  } else {
    column.wipLimit = body.wipLimit;
  }

  if (errors.length > 0) fail(errors);
  return column;
}

// Tarjeta (POST y PUT). Mismas reglas que una tarea, pero sin estado: lo indica la columna.
function validateCard(body) {
  requireObject(body);
  const errors = [];
  const card = {};

  if (typeof body.title !== 'string' || body.title.trim() === '') {
    errors.push({ field: 'title', message: 'El título es obligatorio' });
  } else if (body.title.trim().length > TITLE_MAX) {
    errors.push({ field: 'title', message: `El título admite como máximo ${TITLE_MAX} caracteres` });
  } else {
    card.title = body.title.trim();
  }

  if (isEmpty(body.description)) {
    card.description = null;
  } else if (typeof body.description !== 'string') {
    errors.push({ field: 'description', message: 'La descripción debe ser texto' });
  } else if (body.description.trim().length > DESCRIPTION_MAX) {
    errors.push({ field: 'description', message: `La descripción admite como máximo ${DESCRIPTION_MAX} caracteres` });
  } else {
    card.description = body.description.trim() || null;
  }

  if (body.priority === undefined) {
    card.priority = 'medium';
  } else if (!PRIORITIES.includes(body.priority)) {
    errors.push({ field: 'priority', message: `La prioridad debe ser una de: ${PRIORITIES.join(', ')}` });
  } else {
    card.priority = body.priority;
  }

  if (isEmpty(body.dueDate)) {
    card.dueDate = null;
  } else if (!isValidDate(body.dueDate)) {
    errors.push({ field: 'dueDate', message: 'La fecha límite debe ser una fecha válida con formato YYYY-MM-DD' });
  } else {
    card.dueDate = body.dueDate;
  }

  if (errors.length > 0) fail(errors);
  return card;
}

// PATCH /columns/:id/move -> nueva posición de la columna (obligatoria).
function validateColumnMove(body) {
  requireObject(body);
  if (!isPosition(body.position)) fail([{ field: 'position', message: POSITION_MESSAGE }]);
  return body.position;
}

// PATCH /cards/:id/move -> columna de destino y posición. Sin posición, va al final.
function validateCardMove(body) {
  requireObject(body);
  const columnId = parseBodyId(body.columnId, 'columnId');
  if (isEmpty(body.position)) return { columnId, position: null };
  if (!isPosition(body.position)) fail([{ field: 'position', message: POSITION_MESSAGE }]);
  return { columnId, position: body.position };
}

// POST /columns/:id/move-cards -> columna que recibe todas las tarjetas de la columna :id.
function validateMoveAllCards(body, sourceColumnId) {
  requireObject(body);
  const targetColumnId = parseBodyId(body.targetColumnId, 'targetColumnId');
  if (targetColumnId === sourceColumnId) {
    fail([{ field: 'targetColumnId', message: 'La columna de destino debe ser distinta de la de origen' }]);
  }
  return targetColumnId;
}

module.exports = {
  MAX_COLUMNS,
  MAX_CARDS_PER_COLUMN,
  parseId,
  validateColumn,
  validateCard,
  validateColumnMove,
  validateCardMove,
  validateMoveAllCards,
};
