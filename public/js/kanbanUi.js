// Funciones que leen y modifican el DOM del tablero Kanban. No saben dónde se guardan los datos.
// Los datos del usuario se escriben siempre con textContent (nunca innerHTML) para evitar XSS.

import { el, formatDate, todayIso, PRIORITY_LABELS } from './ui.js';
import { MAX_COLUMNS, MAX_CARDS_PER_COLUMN } from './store/kanbanRules.js';

const COLUMN_FIELDS = ['name', 'wipLimit'];
const CARD_FIELDS = ['title', 'description', 'priority', 'dueDate'];

const $ = (id) => document.getElementById(id);

function button(text, className, label) {
  const node = el('button', className, text);
  node.type = 'button';
  if (label) node.setAttribute('aria-label', label);
  return node;
}

const plural = (count, one, many) => (count === 1 ? `1 ${one}` : `${count} ${many}`);

/* ---------- Estado del tablero ---------- */

export function setBoardLoading(isLoading) {
  $('board').setAttribute('aria-busy', String(isLoading));
  if (isLoading) $('board-status').textContent = 'Cargando tablero…';
}

export function setBoardStatus(text) {
  $('board-status').textContent = text;
}

// Deja la pantalla sin rastro del tablero anterior (al salir del modo invitado).
export function clearBoard() {
  $('board').replaceChildren();
  setBoardStatus('');
  resetColumnForm();
}

/* ---------- Tarjetas ---------- */

function buildCard(card, column, board, handlers) {
  const item = el('li', 'card');
  item.dataset.cardId = card.id;
  item.draggable = true;
  item.tabIndex = -1; // permite devolverle el foco después de volver a pintar el tablero

  item.append(el('h4', 'card-title', card.title));
  if (card.description) item.append(el('p', 'card-description', card.description));

  const meta = el('p', 'card-meta');
  meta.append(el('span', `badge badge-priority-${card.priority}`, `Prioridad ${PRIORITY_LABELS[card.priority].toLowerCase()}`));
  if (card.dueDate) {
    const due = el('span', '', 'Fecha límite: ');
    const time = el('time', '', formatDate(card.dueDate));
    time.dateTime = card.dueDate;
    due.append(time);
    if (card.dueDate < todayIso()) due.append(' ', el('strong', 'overdue', '(vencida)'));
    meta.append(due);
  }
  item.append(meta);

  const previous = board.columns[column.position - 1];
  const next = board.columns[column.position + 1];
  const title = `«${card.title}»`;

  // Cada botón: [acción, texto, etiqueta accesible, disponible, qué hace]
  const moves = [
    ['up', '↑', `Subir ${title}`, card.position > 0,
      () => handlers.onMoveCard(card, column.id, card.position - 1, 'up')],
    ['down', '↓', `Bajar ${title}`, card.position < column.cards.length - 1,
      () => handlers.onMoveCard(card, column.id, card.position + 1, 'down')],
    ['left', '←', previous ? `Mover ${title} a la columna «${previous.name}»` : `Mover ${title} a la columna anterior`, Boolean(previous),
      () => handlers.onMoveCard(card, previous.id, null, 'left')],
    ['right', '→', next ? `Mover ${title} a la columna «${next.name}»` : `Mover ${title} a la columna siguiente`, Boolean(next),
      () => handlers.onMoveCard(card, next.id, null, 'right')],
  ];

  const actions = el('div', 'card-actions');
  for (const [action, text, label, isAvailable, onClick] of moves) {
    const node = button(text, 'button button-icon', label);
    node.dataset.action = action;
    node.disabled = !isAvailable;
    node.addEventListener('click', onClick);
    actions.append(node);
  }

  const editButton = button('Editar', 'button button-small', `Editar ${title}`);
  editButton.dataset.action = 'edit';
  editButton.addEventListener('click', () => handlers.onEditCard(card));

  const deleteButton = button('Eliminar', 'button button-small button-danger', `Eliminar ${title}`);
  deleteButton.addEventListener('click', () => handlers.onDeleteCard(card));

  actions.append(editButton, deleteButton);
  item.append(actions);
  return item;
}

/* ---------- Columnas ---------- */

function buildColumnCount(column) {
  const count = column.cards.length;
  const text = column.wipLimit === null
    ? plural(count, 'tarjeta', 'tarjetas')
    : `${count} / ${column.wipLimit} tarjetas`;
  const node = el('p', 'column-count', text);
  if (column.wipLimit !== null && count > column.wipLimit) {
    // El aviso va también en texto: no depende solo del color.
    node.append(' ', el('strong', 'wip-warning', 'Límite WIP superado'));
  }
  return node;
}

// Menú de opciones de la columna. <details> se abre y se cierra sin JavaScript
// y funciona con teclado.
function buildColumnMenu(column, board, handlers) {
  const menu = el('details', 'column-menu');
  const summary = el('summary', '', 'Opciones');
  summary.setAttribute('aria-label', `Opciones de la columna «${column.name}»`);
  menu.append(summary);

  const items = el('div', 'column-menu-items');
  const isFirst = column.position === 0;
  const isLast = column.position === board.columns.length - 1;
  const hasCards = column.cards.length > 0;

  const editButton = button('Editar nombre y límite', 'button button-small');
  editButton.addEventListener('click', () => handlers.onEditColumn(column));

  const leftButton = button('← Mover a la izquierda', 'button button-small');
  leftButton.disabled = isFirst;
  leftButton.addEventListener('click', () => handlers.onMoveColumn(column, column.position - 1));

  const rightButton = button('Mover a la derecha →', 'button button-small');
  rightButton.disabled = isLast;
  rightButton.addEventListener('click', () => handlers.onMoveColumn(column, column.position + 1));

  items.append(editButton, leftButton, rightButton);

  const others = board.columns.filter((other) => other.id !== column.id);
  if (hasCards && others.length > 0) {
    const group = el('div', 'move-all');
    const label = el('label', '', 'Mover todas las tarjetas a');
    const select = el('select');
    for (const other of others) {
      const option = el('option', '', other.name);
      option.value = other.id;
      select.append(option);
    }
    label.append(select);
    const moveButton = button('Mover todas', 'button button-small');
    moveButton.addEventListener('click', () => handlers.onMoveAllCards(column, select.value));
    group.append(label, moveButton);
    items.append(group);
  }

  const clearButton = button('Vaciar columna', 'button button-small button-danger');
  clearButton.disabled = !hasCards;
  clearButton.addEventListener('click', () => handlers.onClearColumn(column));

  const deleteButton = button('Eliminar columna', 'button button-small button-danger');
  deleteButton.addEventListener('click', () => handlers.onDeleteColumn(column));

  items.append(clearButton, deleteButton);
  menu.append(items);
  return menu;
}

function buildColumn(column, board, handlers) {
  const isOverLimit = column.wipLimit !== null && column.cards.length > column.wipLimit;
  const item = el('li', isOverLimit ? 'board-column over-limit' : 'board-column');
  item.dataset.columnId = column.id;

  const header = el('div', 'column-header');
  header.append(el('h3', 'column-title', column.name), buildColumnCount(column));
  item.append(header, buildColumnMenu(column, board, handlers));

  const list = el('ul', 'card-list');
  list.setAttribute('aria-label', `Tarjetas de «${column.name}»`);
  list.append(...column.cards.map((card) => buildCard(card, column, board, handlers)));
  if (column.cards.length === 0) list.append(el('li', 'card-list-empty', 'Sin tarjetas'));
  item.append(list);

  const addButton = button('Añadir tarjeta', 'button add-card-button', `Añadir tarjeta a «${column.name}»`);
  addButton.disabled = column.cards.length >= MAX_CARDS_PER_COLUMN;
  addButton.addEventListener('click', () => handlers.onAddCard(column));
  item.append(addButton);

  return item;
}

// board: { columns: [columna con cards] }. handlers: funciones que reciben los clics
// (ver kanban.js). Se vuelve a pintar el tablero entero: es pequeño y así siempre
// coincide con lo guardado.
export function renderBoard(board, handlers) {
  $('board').replaceChildren(...board.columns.map((column) => buildColumn(column, board, handlers)));

  const columnCount = board.columns.length;
  const cardCount = board.columns.reduce((total, column) => total + column.cards.length, 0);
  const isFull = columnCount >= MAX_COLUMNS;
  $('add-column-button').disabled = isFull;

  if (columnCount === 0) {
    setBoardStatus('El tablero todavía no tiene columnas. Crea la primera con el formulario.');
  } else {
    const summary = `${plural(columnCount, 'columna', 'columnas')} y ${plural(cardCount, 'tarjeta', 'tarjetas')}.`;
    setBoardStatus(isFull ? `${summary} Has llegado al máximo de ${MAX_COLUMNS} columnas.` : summary);
  }
}

/* ---------- Foco después de volver a pintar ---------- */

// Los ids pueden ser números (API) o textos (modo invitado): se comparan como texto.
function findByData(selector, key, id) {
  return [...document.querySelectorAll(selector)].find((node) => node.dataset[key] === String(id));
}

// Devuelve el foco al botón de la tarjeta que se usó; si ya no está disponible, a la tarjeta.
export function focusCard(cardId, action) {
  const card = findByData('.card', 'cardId', cardId);
  if (!card) return focusBoardHeading();
  const control = action && card.querySelector(`[data-action="${action}"]:not(:disabled)`);
  (control || card).focus();
}

export function focusColumn(columnId) {
  const column = findByData('.board-column', 'columnId', columnId);
  if (!column) return focusBoardHeading();
  column.querySelector('summary').focus();
}

export function focusBoardHeading() {
  $('kanban-heading').focus();
}

/* ---------- Formularios (nueva columna, editar columna, tarjeta) ---------- */

function clearErrors(form, errorPrefix, fields) {
  for (const field of fields) {
    $(`${errorPrefix}-${field}`).textContent = '';
    form.elements[field].removeAttribute('aria-invalid');
  }
}

// details: [{ field, message }] tal como lo devuelve el almacén. Devuelve true si mostró alguno.
function showErrors(form, errorPrefix, fields, details = []) {
  let firstInvalid = null;
  for (const { field, message } of details) {
    if (!fields.includes(field)) continue;
    $(`${errorPrefix}-${field}`).textContent = message;
    form.elements[field].setAttribute('aria-invalid', 'true');
    firstInvalid = firstInvalid || form.elements[field];
  }
  if (firstInvalid) firstInvalid.focus();
  return firstInvalid !== null;
}

// El límite WIP vacío significa "sin límite"; si no, se envía como número.
function readColumnFields(form) {
  const rawLimit = form.elements.wipLimit.value.trim();
  return {
    name: form.elements.name.value,
    wipLimit: rawLimit === '' ? null : Number(rawLimit),
  };
}

export const readColumnForm = () => readColumnFields($('column-form'));
export const showColumnFormErrors = (details) => showErrors($('column-form'), 'column-error', COLUMN_FIELDS, details);
export const clearColumnFormErrors = () => clearErrors($('column-form'), 'column-error', COLUMN_FIELDS);

export function resetColumnForm() {
  $('column-form').reset();
  clearColumnFormErrors();
}

export function focusColumnForm() {
  $('column-form').elements.name.focus();
}

export function openColumnDialog(column) {
  const form = $('column-edit-form');
  clearErrors(form, 'column-edit-error', COLUMN_FIELDS);
  form.elements.name.value = column.name;
  form.elements.wipLimit.value = column.wipLimit === null ? '' : column.wipLimit;
  $('column-dialog').showModal();
  form.elements.name.focus();
}

export const readColumnDialog = () => readColumnFields($('column-edit-form'));
export const showColumnDialogErrors = (details) =>
  showErrors($('column-edit-form'), 'column-edit-error', COLUMN_FIELDS, details);
export const closeColumnDialog = () => $('column-dialog').close();

// card = null abre el diálogo para crear una tarjeta en `columnName`; con tarjeta, para editarla.
export function openCardDialog(card, columnName) {
  const form = $('card-form');
  form.reset();
  clearErrors(form, 'card-error', CARD_FIELDS);
  if (card) {
    form.elements.title.value = card.title;
    form.elements.description.value = card.description || '';
    form.elements.priority.value = card.priority;
    form.elements.dueDate.value = card.dueDate || '';
  }
  $('card-dialog-heading').textContent = card ? 'Editar tarjeta' : `Nueva tarjeta en «${columnName}»`;
  $('card-submit-button').textContent = card ? 'Guardar cambios' : 'Crear tarjeta';
  $('card-dialog').showModal();
  form.elements.title.focus();
}

export function readCardDialog() {
  const form = $('card-form');
  return {
    title: form.elements.title.value,
    description: form.elements.description.value,
    priority: form.elements.priority.value,
    dueDate: form.elements.dueDate.value || null,
  };
}

export const showCardDialogErrors = (details) => showErrors($('card-form'), 'card-error', CARD_FIELDS, details);
export const closeCardDialog = () => $('card-dialog').close();

// Mensaje de error general dentro de un diálogo abierto (los mensajes de la página quedan detrás).
export function showDialogMessage(dialogId, text) {
  const box = $(`${dialogId}-message`);
  box.textContent = text;
  box.hidden = text === '';
}

/* ---------- Exportación ---------- */

// Descarga `data` como archivo JSON. Todo ocurre en el navegador: no se envía a ningún sitio.
export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = el('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
