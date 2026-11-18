// Funciones que leen y modifican el DOM del tablero Kanban. No saben dónde se guardan los datos.
// Los datos del usuario se escriben siempre con textContent (nunca innerHTML) para evitar XSS.

import { el, formatDate, todayIso, PRIORITY_LABELS } from './ui.js';
import { MAX_COLUMNS, MAX_CARDS_PER_COLUMN } from './store/kanbanRules.js';

const COLUMN_FIELDS = ['name'];
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
  $('project-name').value = '';
  $('project-description').value = '';
  setBoardStatus('');
  resetColumnForm();
}

/* ---------- Tarjetas ---------- */

function buildCard(card, handlers) {
  const item = el('li', 'card');
  item.dataset.cardId = card.id;
  item.draggable = true;
  item.tabIndex = -1; // permite devolverle el foco después de volver a pintar el tablero

  // La prioridad va arriba del título, alineada a la izquierda.
  const priority = el('p', 'card-priority');
  priority.append(el('span', `badge badge-priority-${card.priority}`, `Prioridad ${PRIORITY_LABELS[card.priority].toLowerCase()}`));
  item.append(priority, el('h4', 'card-title', card.title));
  if (card.description) item.append(el('p', 'card-description', card.description));

  if (card.dueDate) {
    const meta = el('p', 'card-meta');
    const due = el('span', '', 'Fecha límite: ');
    const time = el('time', '', formatDate(card.dueDate));
    time.dateTime = card.dueDate;
    due.append(time);
    if (card.dueDate < todayIso()) due.append(' ', el('strong', 'overdue', '(vencida)'));
    meta.append(due);
    item.append(meta);
  }

  const title = `«${card.title}»`;
  const actions = el('div', 'card-actions');

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

// Cantidad de tarjetas: «| 3» en gris, al lado del nombre. «tarjetas» queda solo para lector de pantalla.
function buildColumnCount(column) {
  const node = el('span', 'column-count');
  const separator = el('span', '', '|');
  separator.setAttribute('aria-hidden', 'true');
  node.append(separator, ' ', String(column.cards.length), el('span', 'visually-hidden', ' tarjetas'));
  return node;
}

// Menú de opciones de la columna (tres puntos arriba a la derecha). <details> se abre y se
// cierra sin JavaScript y funciona con teclado; kanban.js lo cierra al elegir una opción,
// al hacer clic fuera o al pulsar Escape.
function buildColumnMenu(column, board, handlers) {
  const menu = el('details', 'column-menu');
  const summary = el('summary', '', '⋯');
  summary.setAttribute('aria-label', `Opciones de la columna «${column.name}»`);
  menu.append(summary);

  const items = el('div', 'column-menu-items');
  const name = `«${column.name}»`;

  const editButton = button('Editar', 'button button-small', `Editar la columna ${name}`);
  editButton.addEventListener('click', () => handlers.onEditColumn(column));

  const duplicateButton = button('Duplicar', 'button button-small', `Duplicar la columna ${name}`);
  duplicateButton.disabled = board.columns.length >= MAX_COLUMNS;
  duplicateButton.addEventListener('click', () => handlers.onDuplicateColumn(column));

  const deleteButton = button('Eliminar', 'button button-small button-danger', `Eliminar la columna ${name}`);
  deleteButton.addEventListener('click', () => handlers.onDeleteColumn(column));

  const clearButton = button('Vaciar', 'button button-small button-danger', `Vaciar la columna ${name}`);
  clearButton.disabled = column.cards.length === 0;
  clearButton.addEventListener('click', () => handlers.onClearColumn(column));

  items.append(editButton, duplicateButton, deleteButton, clearButton);
  menu.append(items);
  return menu;
}

// Asa para arrastrar la columna. Es decorativa para lector de pantalla: el equivalente
// accesible son los botones de mover del menú de opciones.
function buildColumnHandle(column) {
  const handle = el('span', 'column-handle', '⠿');
  handle.draggable = true;
  handle.title = `Arrastrar para mover la columna «${column.name}»`;
  handle.setAttribute('aria-hidden', 'true');
  return handle;
}

function buildColumn(column, board, handlers) {
  const item = el('li', 'board-column');
  item.dataset.columnId = column.id;

  const header = el('div', 'column-header');
  header.append(
    buildColumnHandle(column),
    el('h3', 'column-title', column.name),
    buildColumnCount(column),
    buildColumnMenu(column, board, handlers)
  );
  item.append(header);

  const list = el('ul', 'card-list');
  list.setAttribute('aria-label', `Tarjetas de «${column.name}»`);
  list.append(...column.cards.map((card) => buildCard(card, handlers)));
  if (column.cards.length === 0) list.append(el('li', 'card-list-empty', 'Sin tarjetas'));
  item.append(list);

  // Botón sin recuadro: un «+» a la izquierda y el texto. Cambia de color al pasar el ratón o con el foco.
  const addButton = button('', 'add-task-button', `Añadir tarea a «${column.name}»`);
  addButton.append(el('span', 'add-task-plus', '+'), 'Añadir Tarea');
  addButton.disabled = column.cards.length >= MAX_CARDS_PER_COLUMN;
  addButton.addEventListener('click', () => handlers.onAddCard(column));
  item.append(addButton);

  return item;
}

// Hueco entre dos columnas. Con el ratón encima (o con el foco) muestra «Añadir sección», que
// crea una columna nueva en esa posición. Si el tablero está lleno solo queda el hueco.
function buildSectionGap(position, board, handlers) {
  const gap = el('li', 'section-gap');
  if (board.columns.length >= MAX_COLUMNS) return gap;
  const addButton = button('Añadir sección', 'add-section-button', `Añadir una sección en la posición ${position + 1}`);
  addButton.addEventListener('click', () => handlers.onAddSection(position));
  gap.append(addButton);
  return gap;
}

// Título y descripción del proyecto. No se pisa el campo que la persona está escribiendo.
function setProjectField(id, value) {
  const field = $(id);
  if (document.activeElement !== field) field.value = value;
}

export function renderProject(project) {
  setProjectField('project-name', project.name);
  setProjectField('project-description', project.description);
}

export const readProject = () => ({
  name: $('project-name').value,
  description: $('project-description').value,
});

// board: { project, columns: [columna con cards] }. handlers: funciones que reciben los clics
// (ver kanban.js). Se vuelve a pintar el tablero entero: es pequeño y así siempre
// coincide con lo guardado.
export function renderBoard(board, handlers) {
  renderProject(board.project);
  const items = board.columns.flatMap((column, index) => {
    const built = buildColumn(column, board, handlers);
    return index === 0 ? [built] : [buildSectionGap(index, board, handlers), built];
  });
  $('board').replaceChildren(...items);

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

// Devuelve el foco al botón indicado de la tarjeta (action); sin botón o si ya no está disponible, a la tarjeta.
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

function readColumnFields(form) {
  return { name: form.elements.name.value };
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
