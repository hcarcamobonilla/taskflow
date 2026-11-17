// Reglas del tablero Kanban para el modo invitado: validación, topes y orden.
//
// En la versión local estas reglas las aplica el servidor (src/validators/kanban.validator.js
// y src/services/kanban.service.js). Aquí se repiten en JavaScript de navegador para que la
// demo se comporte igual sin backend. La prueba tests/store-parity.test.js ejecuta los
// mismos casos contra ambas implementaciones para detectar diferencias.

import { StoreError } from './StoreError.js';
import { PRIORITIES, isValidDate } from './taskRules.js';

// Topes fijos del tablero: mantienen el tablero legible y acotan su tamaño.
export const MAX_COLUMNS = 8;
export const MAX_CARDS_PER_COLUMN = 50;

const NAME_MAX = 60;
const TITLE_MAX = 150;
const DESCRIPTION_MAX = 2000;
const MAX_INT = 2147483647; // mismo límite que el tipo INTEGER de PostgreSQL

const POSITION_MESSAGE = 'La posición debe ser un número entero mayor o igual que 0';
const TARGET_REQUIRED_MESSAGE = 'La columna de destino es obligatoria';

function fail(details) {
  throw new StoreError('Datos de entrada no válidos', 400, details);
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

/* ---------- Errores de negocio (mismos textos que el servidor) ---------- */

export const columnNotFound = () => new StoreError('Columna no encontrada', 404);
export const cardNotFound = () => new StoreError('Tarjeta no encontrada', 404);
export const boardFull = () => new StoreError(`El tablero admite como máximo ${MAX_COLUMNS} columnas`, 409);
export const columnFull = () => new StoreError(`Una columna admite como máximo ${MAX_CARDS_PER_COLUMN} tarjetas`, 409);

/* ---------- Validación ---------- */

// Columna: nombre obligatorio y límite WIP opcional (null = sin límite).
export function validateColumn(body) {
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

// Tarjeta. Mismas reglas que una tarea, pero sin estado: lo indica la columna.
export function validateCard(body) {
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

// Nueva posición de una columna (obligatoria).
export function validateColumnMove(body) {
  requireObject(body);
  if (!isPosition(body.position)) fail([{ field: 'position', message: POSITION_MESSAGE }]);
  return body.position;
}

// Columna de destino y posición de una tarjeta. Sin posición, va al final.
// En el modo invitado los ids son textos (no números como en PostgreSQL).
export function validateCardMove(body) {
  requireObject(body);
  if (isEmpty(body.columnId)) fail([{ field: 'columnId', message: TARGET_REQUIRED_MESSAGE }]);
  const columnId = String(body.columnId);
  if (isEmpty(body.position)) return { columnId, position: null };
  if (!isPosition(body.position)) fail([{ field: 'position', message: POSITION_MESSAGE }]);
  return { columnId, position: body.position };
}

// Columna que recibe todas las tarjetas de otra.
export function validateMoveAllCards(body, sourceColumnId) {
  requireObject(body);
  if (isEmpty(body.targetColumnId)) fail([{ field: 'targetColumnId', message: TARGET_REQUIRED_MESSAGE }]);
  const targetColumnId = String(body.targetColumnId);
  if (targetColumnId === String(sourceColumnId)) {
    fail([{ field: 'targetColumnId', message: 'La columna de destino debe ser distinta de la de origen' }]);
  }
  return targetColumnId;
}

/* ---------- Orden ---------- */

// Inserta `item` en la posición pedida. Sin posición, o si se pasa del final, va al final.
export function insertAt(list, item, position) {
  const index = position === null ? list.length : Math.min(position, list.length);
  return [...list.slice(0, index), item, ...list.slice(index)];
}

/* ---------- Exportación ---------- */

// Contenido del archivo JSON que descarga "Exportar tablero". No incluye ids ni datos
// internos: solo lo que el usuario escribió, en el orden en que lo ve.
export function toExport(board, exportedAt) {
  return {
    app: 'TaskFlow',
    type: 'kanban-board',
    version: 1,
    exportedAt,
    columns: board.columns.map((column) => ({
      name: column.name,
      wipLimit: column.wipLimit,
      cards: column.cards.map((card) => ({
        title: card.title,
        description: card.description,
        priority: card.priority,
        dueDate: card.dueDate,
      })),
    })),
  };
}
