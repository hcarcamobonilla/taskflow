// Tablero Kanban: conecta los eventos del tablero con el almacén (API o sessionStorage)
// y con las funciones que pintan el DOM (kanbanUi.js). main.js lo inicia y decide cuándo
// se muestra.

import * as ui from './ui.js';
import * as boardUi from './kanbanUi.js';
import { enableCardDrag } from './kanbanDrag.js';
import { toExport } from './store/kanbanRules.js';

// Adaptador de almacenamiento; lo entrega main.js en init().
let store = null;

// Último tablero pintado: sirve para saber dónde estaba cada tarjeta al arrastrarla.
let currentBoard = { columns: [] };

// Número de la última carga pedida: si llegan respuestas desordenadas, solo se pinta la más reciente.
let lastLoadId = 0;

// Qué se está editando en cada diálogo.
let editingColumn = null;
let cardDialog = null; // { card } al editar, { column } al crear

const handlers = {
  onEditColumn: handleEditColumn,
  onMoveColumn: handleMoveColumn,
  onMoveAllCards: handleMoveAllCards,
  onClearColumn: handleClearColumn,
  onDeleteColumn: handleDeleteColumn,
  onAddCard: handleAddCard,
  onEditCard: handleEditCard,
  onDeleteCard: handleDeleteCard,
  onMoveCard: handleMoveCard,
};

export async function load() {
  const loadId = ++lastLoadId;
  boardUi.setBoardLoading(true);
  try {
    const board = await store.getBoard();
    if (loadId !== lastLoadId) return;
    currentBoard = board;
    boardUi.renderBoard(board, handlers);
  } catch (error) {
    if (loadId !== lastLoadId) return;
    boardUi.setBoardStatus('No se pudo cargar el tablero.');
    ui.showMessage(error.message, 'error');
  } finally {
    if (loadId === lastLoadId) boardUi.setBoardLoading(false);
  }
}

// Ejecuta un cambio en el almacén, avisa del resultado y vuelve a pintar el tablero.
// Se recarga siempre: si hubo error, el tablero vuelve a mostrar el estado real.
async function applyChange(change, successMessage) {
  try {
    await change();
    if (successMessage) ui.showMessage(successMessage);
  } catch (error) {
    ui.showMessage(error.message, 'error');
  }
  await load();
}

function findCard(cardId) {
  for (const column of currentBoard.columns) {
    const card = column.cards.find((item) => String(item.id) === String(cardId));
    if (card) return card;
  }
  return null;
}

/* ---------- Columnas ---------- */

async function handleCreateColumn(event) {
  event.preventDefault();
  boardUi.clearColumnFormErrors();
  ui.clearMessage();

  try {
    const column = await store.createColumn(boardUi.readColumnForm());
    boardUi.resetColumnForm();
    ui.showMessage(`Columna «${column.name}» creada.`);
    await load();
    boardUi.focusColumnForm();
  } catch (error) {
    const shownInFields = boardUi.showColumnFormErrors(error.details);
    ui.showMessage(shownInFields ? 'Revisa los campos marcados.' : error.message, 'error');
  }
}

function handleEditColumn(column) {
  editingColumn = column;
  boardUi.showDialogMessage('column-dialog', '');
  boardUi.openColumnDialog(column);
}

async function handleSubmitColumnDialog(event) {
  event.preventDefault();
  const column = editingColumn;
  try {
    await store.updateColumn(column.id, boardUi.readColumnDialog());
  } catch (error) {
    if (!boardUi.showColumnDialogErrors(error.details)) boardUi.showDialogMessage('column-dialog', error.message);
    return;
  }
  boardUi.closeColumnDialog();
  ui.showMessage('Columna actualizada.');
  await load();
  boardUi.focusColumn(column.id);
}

async function handleMoveColumn(column, position) {
  await applyChange(() => store.moveColumn(column.id, position));
  boardUi.focusColumn(column.id);
}

async function handleMoveAllCards(column, targetColumnId) {
  await applyChange(() => store.moveAllCards(column.id, targetColumnId), 'Tarjetas movidas.');
  boardUi.focusColumn(column.id);
}

async function handleClearColumn(column) {
  const confirmed = window.confirm(
    `¿Vaciar la columna «${column.name}»? Se eliminarán sus ${column.cards.length} tarjetas y no podrás recuperarlas.`
  );
  if (!confirmed) return;
  await applyChange(() => store.clearColumn(column.id), `Columna «${column.name}» vaciada.`);
  boardUi.focusColumn(column.id);
}

async function handleDeleteColumn(column) {
  const cardsWarning = column.cards.length > 0 ? ` Se eliminarán también sus ${column.cards.length} tarjetas.` : '';
  const confirmed = window.confirm(
    `¿Eliminar la columna «${column.name}»?${cardsWarning} Esta acción no se puede deshacer.`
  );
  if (!confirmed) return;
  await applyChange(() => store.deleteColumn(column.id), `Columna «${column.name}» eliminada.`);
  boardUi.focusBoardHeading();
}

/* ---------- Tarjetas ---------- */

function handleAddCard(column) {
  cardDialog = { column };
  boardUi.showDialogMessage('card-dialog', '');
  boardUi.openCardDialog(null, column.name);
}

function handleEditCard(card) {
  cardDialog = { card };
  boardUi.showDialogMessage('card-dialog', '');
  boardUi.openCardDialog(card);
}

async function handleSubmitCardDialog(event) {
  event.preventDefault();
  const { card, column } = cardDialog;
  const fields = boardUi.readCardDialog();

  let saved;
  try {
    saved = card ? await store.updateCard(card.id, fields) : await store.createCard(column.id, fields);
  } catch (error) {
    if (!boardUi.showCardDialogErrors(error.details)) boardUi.showDialogMessage('card-dialog', error.message);
    return;
  }
  boardUi.closeCardDialog();
  ui.showMessage(card ? 'Cambios guardados correctamente.' : 'Tarjeta creada correctamente.');
  await load();
  boardUi.focusCard(saved.id, 'edit');
}

async function handleDeleteCard(card) {
  const confirmed = window.confirm(`¿Eliminar la tarjeta «${card.title}»? Esta acción no se puede deshacer.`);
  if (!confirmed) return;
  await applyChange(() => store.deleteCard(card.id), 'Tarjeta eliminada.');
  boardUi.focusColumn(card.columnId);
}

// position = null la deja al final de la columna. `action` es el botón usado (para el foco).
async function handleMoveCard(card, columnId, position, action) {
  await applyChange(() => store.moveCard(card.id, columnId, position));
  boardUi.focusCard(card.id, action);
}

// Al soltar una tarjeta arrastrada. Si cae donde ya estaba, no se hace nada.
function handleDropCard(cardId, columnId, position) {
  const card = findCard(cardId);
  if (!card) return;
  const isSamePlace = String(card.columnId) === String(columnId) && card.position === position;
  if (!isSamePlace) handleMoveCard(card, columnId, position);
}

/* ---------- Exportación ---------- */

async function handleExport() {
  try {
    const exported = toExport(await store.getBoard(), new Date().toISOString());
    boardUi.downloadJson(`taskflow-kanban-${exported.exportedAt.slice(0, 10)}.json`, exported);
    ui.showMessage('Tablero exportado a un archivo JSON.');
  } catch (error) {
    ui.showMessage(error.message, 'error');
  }
}

/* ---------- Arranque ---------- */

export function init(selectedStore) {
  store = selectedStore;

  document.getElementById('column-form').addEventListener('submit', handleCreateColumn);
  document.getElementById('column-edit-form').addEventListener('submit', handleSubmitColumnDialog);
  document.getElementById('card-form').addEventListener('submit', handleSubmitCardDialog);
  document.getElementById('column-cancel-button').addEventListener('click', boardUi.closeColumnDialog);
  document.getElementById('card-cancel-button').addEventListener('click', boardUi.closeCardDialog);
  document.getElementById('export-board-button').addEventListener('click', handleExport);

  enableCardDrag(document.getElementById('board'), handleDropCard);
}

// Deja el tablero vacío en pantalla (al salir del modo invitado).
export function clearScreen() {
  lastLoadId += 1; // descarta cualquier carga que siguiera en curso
  currentBoard = { columns: [] };
  boardUi.clearBoard();
}
