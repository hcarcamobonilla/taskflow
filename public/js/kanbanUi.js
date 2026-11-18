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
  $('completed-count').textContent = '';
  setBoardStatus('');
  resetColumnForm();
}

/* ---------- Tarjetas ---------- */

// Menú de opciones (tres puntos) que usan las columnas y las tareas. <details> se abre y se
// cierra sin JavaScript y funciona con teclado; kanban.js lo cierra al elegir una opción,
// al hacer clic fuera o al pulsar Escape.
// options: [{ text, label, onClick, danger, disabled }]
function buildOptionsMenu(menuLabel, options) {
  const menu = el('details', 'options-menu');
  const summary = el('summary', '', '⋯');
  summary.setAttribute('aria-label', menuLabel);
  summary.dataset.action = 'menu';
  menu.append(summary);

  const items = el('div', 'options-menu-items');
  for (const { text, label, onClick, danger, disabled } of options) {
    const node = button(text, danger ? 'button button-small button-danger' : 'button button-small', label);
    node.disabled = Boolean(disabled);
    node.addEventListener('click', onClick);
    items.append(node);
  }
  menu.append(items);
  return menu;
}

function buildCard(card, board, handlers) {
  const item = el('li', 'card');
  item.dataset.cardId = card.id;
  item.draggable = true;
  item.tabIndex = -1; // permite devolverle el foco después de volver a pintar el tablero

  const title = `«${card.title}»`;

  // Círculo arriba a la izquierda: completa la tarea (se elimina y suma al contador). Su color
  // indica la prioridad; también va en el texto del botón para no depender solo del color.
  const priorityName = PRIORITY_LABELS[card.priority].toLowerCase();
  const check = button('', `card-check card-check-${card.priority}`, `Completar la tarea ${title} (prioridad ${priorityName})`);
  check.title = `Prioridad ${priorityName}`;
  check.append(el('span', 'card-check-mark', '✓'));
  check.addEventListener('click', () => handlers.onCompleteCard(card));

  // El título va arriba; la prioridad ya no lleva etiqueta.
  const body = el('div', 'card-body');
  body.append(el('h4', 'card-title', card.title));
  if (card.description) body.append(el('p', 'card-description', card.description));

  if (card.dueDate) {
    const today = todayIso();
    const meta = el('p', card.dueDate === today ? 'card-meta card-meta-today' : 'card-meta');
    const due = el('span', '', 'Fecha límite: ');
    const time = el('time', '', formatDate(card.dueDate));
    time.dateTime = card.dueDate;
    due.append(time);
    if (card.dueDate < today) due.append(' ', el('strong', 'overdue', '(vencida)'));
    // El rojo oscuro no debe ser la única pista: un lector de pantalla oye «vence hoy».
    if (card.dueDate === today) due.append(el('span', 'visually-hidden', ' (vence hoy)'));
    meta.append(due);
    body.append(meta);
  }

  const menu = buildOptionsMenu(`Opciones de la tarea ${title}`, [
    { text: 'Editar', label: `Editar la tarea ${title}`, onClick: () => handlers.onEditCard(card) },
    { text: 'Duplicar', label: `Duplicar la tarea ${title}`, onClick: () => handlers.onDuplicateCard(card),
      disabled: board.columns.find((column) => String(column.id) === String(card.columnId))?.cards.length >= MAX_CARDS_PER_COLUMN },
    { text: 'Mover', label: `Mover la tarea ${title} a otra columna`, onClick: () => handlers.onMoveCardTo(card),
      disabled: board.columns.length < 2 },
    { text: 'Eliminar', label: `Eliminar la tarea ${title}`, onClick: () => handlers.onDeleteCard(card), danger: true },
  ]);

  item.append(check, body, menu);
  return item;
}

/* ---------- Columnas ---------- */

// Cantidad de tarjetas: «| 3» en gris, al lado del nombre. «tarjetas» queda solo para lector de pantalla.
function buildColumnCount(column) {
  const node = el('span', 'column-count');
  const separator = el('span', '', '|');
  separator.setAttribute('aria-hidden', 'true');
  node.append(separator, ' ', String(column.cards.length), el('span', 'visually-hidden', ' tareas'));
  return node;
}

function buildColumnMenu(column, board, handlers) {
  const name = `«${column.name}»`;
  return buildOptionsMenu(`Opciones de la columna ${name}`, [
    { text: 'Editar', label: `Editar la columna ${name}`, onClick: () => handlers.onEditColumn(column) },
    { text: 'Duplicar', label: `Duplicar la columna ${name}`, onClick: () => handlers.onDuplicateColumn(column),
      disabled: board.columns.length >= MAX_COLUMNS },
    { text: 'Eliminar', label: `Eliminar la columna ${name}`, onClick: () => handlers.onDeleteColumn(column), danger: true },
    { text: 'Vaciar', label: `Vaciar la columna ${name}`, onClick: () => handlers.onClearColumn(column),
      danger: true, disabled: column.cards.length === 0 },
  ]);
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
  list.setAttribute('aria-label', `Tareas de «${column.name}»`);
  list.append(...column.cards.map((card) => buildCard(card, board, handlers)));
  if (column.cards.length === 0) list.append(el('li', 'card-list-empty', 'Sin tareas'));
  item.append(list);

  // Botón sin recuadro: un «+» a la izquierda y el texto. Cambia de color al pasar el ratón o con el foco.
  const addButton = button('', 'add-task-button', `Añadir tarea a «${column.name}»`);
  addButton.append(el('span', 'add-task-plus', '+'), 'Añadir Tarea');
  addButton.disabled = column.cards.length >= MAX_CARDS_PER_COLUMN;
  addButton.addEventListener('click', () => handlers.onAddCard(column));
  item.append(addButton);

  return item;
}

// Hueco entre dos columnas. Con el ratón encima (o con el foco) se ve una línea y «Añadir sección»,
// que crea una columna nueva en esa posición. Si el tablero está lleno solo queda el hueco.
function buildSectionGap(position, board, handlers) {
  const gap = el('li', 'section-gap');
  if (board.columns.length >= MAX_COLUMNS) return gap;
  // El botón ocupa todo el hueco: se ve una línea vertical y, más abajo, el texto «Añadir sección».
  const addButton = button('', 'add-section-button', `Añadir una sección en la posición ${position + 1}`);
  addButton.append(el('span', 'add-section-label', 'Añadir sección'));
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
  $('completed-count').textContent = plural(project.completedCount, 'Tarea Completada', 'Tareas Completadas');
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
    const summary = `${plural(columnCount, 'Columna', 'Columnas')} | ${plural(cardCount, 'Tarea', 'Tareas')}`;
    setBoardStatus(isFull ? `${summary} (máximo de ${MAX_COLUMNS} columnas)` : summary);
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
  $('card-dialog-heading').textContent = card ? 'Editar tarea' : `Nueva tarea en «${columnName}»`;
  $('card-submit-button').textContent = card ? 'Guardar cambios' : 'Crear tarea';
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

// Diálogo «Mover tarea»: lista las demás columnas (la tarea va al final de la elegida).
export function openMoveDialog(card, columns) {
  const select = $('move-column');
  select.replaceChildren(
    ...columns
      .filter((column) => String(column.id) !== String(card.columnId))
      .map((column) => {
        const option = el('option', '', column.name);
        option.value = column.id;
        return option;
      })
  );
  $('move-dialog-heading').textContent = `Mover «${card.title}»`;
  $('move-dialog').showModal();
  select.focus();
}

export const readMoveDialog = () => $('move-column').value;
export const closeMoveDialog = () => $('move-dialog').close();

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
