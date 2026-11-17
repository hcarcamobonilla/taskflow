// Tablero Kanban en el modo invitado: columnas y tarjetas viven en sessionStorage.
// No hace ninguna petición de red. Misma interfaz que apiKanban.js.
//
// Se guarda un único objeto { columns: [ { ..., cards: [ ... ] } ] }. El orden de los
// arreglos ES el orden del tablero, así que `position` y `columnId` no se guardan:
// se calculan al devolver los datos, con la misma forma que usa la API.

import { readJson, writeJson, corruptDataError, newId, now } from './sessionAccess.js';
import { PRIORITIES } from './taskRules.js';
import {
  MAX_COLUMNS,
  MAX_CARDS_PER_COLUMN,
  validateColumn,
  validateCard,
  validateColumnMove,
  validateCardMove,
  validateMoveAllCards,
  insertAt,
  columnNotFound,
  cardNotFound,
  boardFull,
  columnFull,
} from './kanbanRules.js';

// Clave propia de TaskFlow: nunca se toca ningún otro dato del mismo origen.
export const KANBAN_KEY = 'taskflow.guest.kanban';

/* ---------- Lectura y escritura ---------- */

function looksLikeCard(item) {
  return (
    item !== null &&
    typeof item === 'object' &&
    typeof item.id === 'string' &&
    typeof item.title === 'string' &&
    PRIORITIES.includes(item.priority)
  );
}

function looksLikeColumn(item) {
  return (
    item !== null &&
    typeof item === 'object' &&
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    Array.isArray(item.cards) &&
    item.cards.every(looksLikeCard)
  );
}

function readColumns() {
  const saved = readJson(KANBAN_KEY);
  if (saved === null) return [];
  const isValid =
    typeof saved === 'object' && Array.isArray(saved.columns) && saved.columns.every(looksLikeColumn);
  if (!isValid) throw corruptDataError();
  return saved.columns;
}

function writeColumns(columns) {
  writeJson(KANBAN_KEY, { columns });
}

/* ---------- Forma de los datos devueltos (igual que la API) ---------- */

function toColumn(column, position) {
  const { cards, ...fields } = column;
  return { ...fields, position };
}

function toCard(card, columnId, position) {
  return { ...card, columnId, position };
}

function toBoard(columns) {
  return {
    columns: columns.map((column, position) => ({
      ...toColumn(column, position),
      cards: column.cards.map((card, index) => toCard(card, column.id, index)),
    })),
  };
}

/* ---------- Búsquedas ---------- */

function findColumnIndexOrFail(columns, id) {
  const index = columns.findIndex((column) => column.id === String(id));
  if (index === -1) throw columnNotFound();
  return index;
}

// Devuelve la columna que contiene la tarjeta y el lugar que ocupa en ella.
function findCardOrFail(columns, id) {
  for (const column of columns) {
    const index = column.cards.findIndex((card) => card.id === String(id));
    if (index !== -1) return { column, index };
  }
  throw cardNotFound();
}

/* ---------- Interfaz común (la misma que apiKanban.js) ---------- */

export async function getBoard() {
  return toBoard(readColumns());
}

export async function createColumn(input) {
  const fields = validateColumn(input);
  const columns = readColumns();
  if (columns.length >= MAX_COLUMNS) throw boardFull();
  const timestamp = now();
  const column = { id: newId(), ...fields, createdAt: timestamp, updatedAt: timestamp, cards: [] };
  columns.push(column);
  writeColumns(columns);
  return toColumn(column, columns.length - 1);
}

export async function updateColumn(id, input) {
  const fields = validateColumn(input);
  const columns = readColumns();
  const index = findColumnIndexOrFail(columns, id);
  columns[index] = { ...columns[index], ...fields, updatedAt: now() };
  writeColumns(columns);
  return toColumn(columns[index], index);
}

export async function moveColumn(id, position) {
  const newPosition = validateColumnMove({ position });
  const columns = readColumns();
  const [column] = columns.splice(findColumnIndexOrFail(columns, id), 1);
  const reordered = insertAt(columns, column, newPosition);
  writeColumns(reordered);
  return toBoard(reordered);
}

export async function deleteColumn(id) {
  const columns = readColumns();
  columns.splice(findColumnIndexOrFail(columns, id), 1);
  writeColumns(columns);
  return null;
}

export async function clearColumn(id) {
  const columns = readColumns();
  columns[findColumnIndexOrFail(columns, id)].cards = [];
  writeColumns(columns);
  return null;
}

// Pasa todas las tarjetas de una columna al final de otra, conservando su orden.
export async function moveAllCards(id, targetColumnId) {
  const targetId = validateMoveAllCards({ targetColumnId }, id);
  const columns = readColumns();
  const source = columns[findColumnIndexOrFail(columns, id)];
  const target = columns[findColumnIndexOrFail(columns, targetId)];
  if (source.cards.length + target.cards.length > MAX_CARDS_PER_COLUMN) throw columnFull();
  target.cards = [...target.cards, ...source.cards];
  source.cards = [];
  writeColumns(columns);
  return toBoard(columns);
}

export async function createCard(columnId, input) {
  const fields = validateCard(input);
  const columns = readColumns();
  const column = columns[findColumnIndexOrFail(columns, columnId)];
  if (column.cards.length >= MAX_CARDS_PER_COLUMN) throw columnFull();
  const timestamp = now();
  const card = { id: newId(), ...fields, createdAt: timestamp, updatedAt: timestamp };
  column.cards.push(card);
  writeColumns(columns);
  return toCard(card, column.id, column.cards.length - 1);
}

export async function updateCard(id, input) {
  const fields = validateCard(input);
  const columns = readColumns();
  const { column, index } = findCardOrFail(columns, id);
  column.cards[index] = { ...column.cards[index], ...fields, updatedAt: now() };
  writeColumns(columns);
  return toCard(column.cards[index], column.id, index);
}

// Mueve una tarjeta a `columnId` (puede ser su misma columna). Sin `position`, va al final.
export async function moveCard(id, columnId, position) {
  const move = validateCardMove({ columnId, position });
  const columns = readColumns();
  const { column: source, index } = findCardOrFail(columns, id);
  const target = columns[findColumnIndexOrFail(columns, move.columnId)];
  if (target !== source && target.cards.length >= MAX_CARDS_PER_COLUMN) throw columnFull();

  const [card] = source.cards.splice(index, 1);
  target.cards = insertAt(target.cards, card, move.position);
  writeColumns(columns);
  return toCard(card, target.id, target.cards.indexOf(card));
}

export async function deleteCard(id) {
  const columns = readColumns();
  const { column, index } = findCardOrFail(columns, id);
  column.cards.splice(index, 1);
  writeColumns(columns);
  return null;
}
