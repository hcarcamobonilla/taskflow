// Lógica de negocio del tablero Kanban: topes, orden de columnas y tarjetas, y qué
// operaciones necesitan una transacción. No sabe de HTTP salvo por los errores que lanza
// (HttpError), ni escribe SQL: eso es trabajo del repositorio.
//
// Idea común a todos los movimientos: se lee la lista de ids en su orden, se reordena en
// JavaScript y se guarda de nuevo. La posición de cada elemento es su lugar en la lista.

const pool = require('../db/pool');
const { withTransaction } = require('../db/transaction');
const repository = require('../repositories/kanban.repository');
const { MAX_COLUMNS, MAX_CARDS_PER_COLUMN, copyColumnName } = require('../validators/kanban.validator');
const HttpError = require('../utils/HttpError');

const columnNotFound = () => new HttpError(404, 'Columna no encontrada');
const cardNotFound = () => new HttpError(404, 'Tarjeta no encontrada');
const boardFull = () => new HttpError(409, `El tablero admite como máximo ${MAX_COLUMNS} columnas`);
const columnFull = () => new HttpError(409, `Una columna admite como máximo ${MAX_CARDS_PER_COLUMN} tarjetas`);

// Inserta `id` en la posición pedida. Sin posición, o si se pasa del final, va al final.
function insertAt(ids, id, position) {
  const index = position === null ? ids.length : Math.min(position, ids.length);
  return [...ids.slice(0, index), id, ...ids.slice(index)];
}

// Tablero completo: el proyecto y cada columna con sus tarjetas, todo en orden.
async function getBoard(db = pool) {
  const project = await repository.findProject(db);
  const columns = await repository.findColumns(db);
  const cards = await repository.findCards(db);
  return {
    project,
    columns: columns.map((column) => ({
      ...column,
      cards: cards.filter((card) => card.columnId === column.id),
    })),
  };
}

/* ---------- Proyecto ---------- */

function updateProject(input) {
  return repository.saveProject(pool, input);
}

/* ---------- Columnas ---------- */

// Crea una columna en la posición pedida (sin posición, al final) y renumera las demás.
function createColumn({ name, position }) {
  return withTransaction(async (db) => {
    const ids = await repository.lockAllColumnIds(db);
    if (ids.length >= MAX_COLUMNS) throw boardFull();
    const column = await repository.insertColumn(db, { name }, ids.length);
    const order = insertAt(ids, column.id, position);
    await repository.saveColumnOrder(db, order);
    return { ...column, position: order.indexOf(column.id) };
  });
}

// Copia la columna y todas sus tarjetas justo a su derecha.
function duplicateColumn(id) {
  return withTransaction(async (db) => {
    const ids = await repository.lockAllColumnIds(db);
    if (!ids.includes(id)) throw columnNotFound();
    if (ids.length >= MAX_COLUMNS) throw boardFull();

    const source = await repository.findColumn(db, id);
    const copy = await repository.insertColumn(db, { name: copyColumnName(source.name) }, ids.length);
    await repository.copyCards(db, id, copy.id);
    await repository.saveColumnOrder(db, insertAt(ids, copy.id, ids.indexOf(id) + 1));

    const board = await getBoard(db);
    return board.columns.find((column) => column.id === copy.id);
  });
}

async function updateColumn(id, input) {
  const column = await repository.updateColumn(pool, id, input);
  if (!column) throw columnNotFound();
  return column;
}

function moveColumn(id, position) {
  return withTransaction(async (db) => {
    const ids = await repository.lockAllColumnIds(db);
    if (!ids.includes(id)) throw columnNotFound();
    const others = ids.filter((columnId) => columnId !== id);
    await repository.saveColumnOrder(db, insertAt(others, id, position));
    return getBoard(db);
  });
}

function removeColumn(id) {
  return withTransaction(async (db) => {
    const ids = await repository.lockAllColumnIds(db);
    if (!ids.includes(id)) throw columnNotFound();
    await repository.deleteColumn(db, id);
    // Las columnas restantes se renumeran para no dejar huecos en las posiciones.
    await repository.saveColumnOrder(db, ids.filter((columnId) => columnId !== id));
  });
}

function clearColumn(id) {
  return withTransaction(async (db) => {
    const found = await repository.lockColumns(db, [id]);
    if (found.length === 0) throw columnNotFound();
    await repository.deleteCardsOfColumn(db, id);
  });
}

// Pasa todas las tarjetas de una columna al final de otra, conservando su orden.
function moveAllCards(sourceId, targetId) {
  return withTransaction(async (db) => {
    const found = await repository.lockColumns(db, [sourceId, targetId]);
    if (!found.includes(sourceId) || !found.includes(targetId)) throw columnNotFound();

    const sourceCards = await repository.findCardIds(db, sourceId);
    const targetCards = await repository.findCardIds(db, targetId);
    if (sourceCards.length + targetCards.length > MAX_CARDS_PER_COLUMN) throw columnFull();

    await repository.saveCardOrder(db, targetId, [...targetCards, ...sourceCards]);
    return getBoard(db);
  });
}

/* ---------- Tarjetas ---------- */

function createCard(columnId, input) {
  return withTransaction(async (db) => {
    const found = await repository.lockColumns(db, [columnId]);
    if (found.length === 0) throw columnNotFound();
    const ids = await repository.findCardIds(db, columnId);
    if (ids.length >= MAX_CARDS_PER_COLUMN) throw columnFull();
    return repository.insertCard(db, columnId, input, ids.length);
  });
}

async function updateCard(id, input) {
  const card = await repository.updateCard(pool, id, input);
  if (!card) throw cardNotFound();
  return card;
}

// Mueve una tarjeta a `columnId` (puede ser su misma columna) en la posición indicada.
function moveCard(id, { columnId, position }) {
  return withTransaction(async (db) => {
    const card = await repository.findCard(db, id);
    if (!card) throw cardNotFound();

    const changesColumn = card.columnId !== columnId;
    const found = await repository.lockColumns(db, changesColumn ? [card.columnId, columnId] : [columnId]);
    if (!found.includes(columnId)) throw columnNotFound();

    const targetCards = (await repository.findCardIds(db, columnId)).filter((cardId) => cardId !== id);
    if (changesColumn && targetCards.length >= MAX_CARDS_PER_COLUMN) throw columnFull();

    await repository.saveCardOrder(db, columnId, insertAt(targetCards, id, position));
    if (changesColumn) {
      // La columna de origen se renumera para cerrar el hueco que dejó la tarjeta.
      await repository.saveCardOrder(db, card.columnId, await repository.findCardIds(db, card.columnId));
    }
    return repository.findCard(db, id);
  });
}

function removeCard(id) {
  return withTransaction(async (db) => {
    const card = await repository.findCard(db, id);
    if (!card) throw cardNotFound();
    await repository.lockColumns(db, [card.columnId]);
    await repository.deleteCard(db, id);
    await repository.saveCardOrder(db, card.columnId, await repository.findCardIds(db, card.columnId));
  });
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
  moveCard,
  removeCard,
};
