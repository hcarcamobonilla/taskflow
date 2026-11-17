// Funciones que leen y modifican el DOM. No saben dónde se guardan las tareas.
// Los datos del usuario se escriben siempre con textContent (nunca innerHTML) para evitar XSS.

export const STATUS_LABELS = {
  pending: 'Pendiente',
  in_progress: 'En progreso',
  completed: 'Completada',
};

export const PRIORITY_LABELS = { low: 'Baja', medium: 'Media', high: 'Alta' };

const FORM_FIELDS = ['title', 'description', 'status', 'priority', 'dueDate'];

const $ = (id) => document.getElementById(id);

// Crea un elemento con clase y texto opcionales.
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// 'YYYY-MM-DD' -> 'DD/MM/YYYY' sin pasar por Date (evita desfases de zona horaria).
export function formatDate(isoDate) {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

export function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/* ---------- Pantallas: bienvenida, elección de vista y aplicación ---------- */

// Muestra la aplicación. Con isGuest = true añade la barra del modo invitado.
export function showApp({ isGuest }) {
  $('welcome').hidden = true;
  $('welcome-error').hidden = true;
  $('view-chooser').hidden = true;
  $('guest-bar').hidden = !isGuest;
  $('app').hidden = false;
  $('skip-link').hidden = false;
}

export function showWelcome() {
  $('app').hidden = true;
  $('skip-link').hidden = true;
  $('view-chooser').hidden = true;
  $('welcome').hidden = false;
}

// Pantalla en la que el invitado elige cómo organizar sus tareas (lista o tablero).
export function showViewChooser() {
  $('welcome').hidden = true;
  $('app').hidden = true;
  $('skip-link').hidden = true;
  $('view-chooser').hidden = false;
  $('chooser-heading').focus();
}

const VIEW_SKIP_LINKS = {
  list: { href: '#tasks-heading', text: 'Saltar a la lista de tareas' },
  kanban: { href: '#kanban-heading', text: 'Saltar al tablero Kanban' },
};

// Muestra una de las dos vistas de la aplicación ('list' o 'kanban') y marca su botón.
export function showView(view) {
  $('list-view').hidden = view !== 'list';
  $('kanban-view').hidden = view !== 'kanban';
  for (const button of document.querySelectorAll('#view-switch [data-view]')) {
    button.setAttribute('aria-pressed', String(button.dataset.view === view));
  }
  $('skip-link').href = VIEW_SKIP_LINKS[view].href;
  $('skip-link').textContent = VIEW_SKIP_LINKS[view].text;
}

export function showWelcomeError(text) {
  const box = $('welcome-error');
  box.textContent = text;
  box.hidden = false;
}

export function focusWelcome() {
  $('welcome-heading').focus();
}

export function focusGuestExit() {
  $('exit-guest-button').focus();
}

// Deja la pantalla sin rastro de las tareas anteriores (al salir del modo invitado).
export function clearScreen() {
  clearMessage();
  resetForm();
  $('filters-form').reset();
  $('task-list').replaceChildren();
  setListStatus('');
  for (const key of ['total', 'pending', 'in_progress', 'completed']) {
    $(`count-${key}`).textContent = '–';
  }
}

/* ---------- Mensajes ---------- */

let messageTimer;

export function showMessage(text, type = 'success') {
  const box = $('message');
  clearTimeout(messageTimer);
  box.textContent = text;
  box.className = `message message-${type}`;
  box.hidden = false;
  // Los mensajes de éxito desaparecen solos; los de error permanecen hasta la siguiente acción.
  if (type === 'success') {
    messageTimer = setTimeout(clearMessage, 5000);
  }
}

export function clearMessage() {
  const box = $('message');
  clearTimeout(messageTimer);
  box.hidden = true;
  box.textContent = '';
}

/* ---------- Dashboard ---------- */

export function renderDashboard(counts) {
  const total = counts.pending + counts.in_progress + counts.completed;
  $('count-total').textContent = total;
  $('count-pending').textContent = counts.pending;
  $('count-in_progress').textContent = counts.in_progress;
  $('count-completed').textContent = counts.completed;
}

/* ---------- Lista de tareas ---------- */

export function setListLoading(isLoading) {
  $('task-list').setAttribute('aria-busy', String(isLoading));
  if (isLoading) $('list-status').textContent = 'Cargando tareas…';
}

export function setListStatus(text) {
  $('list-status').textContent = text;
}

function buildStatusSelect(task, onStatusChange) {
  const wrapper = el('label', 'task-status-control');
  wrapper.append(el('span', 'visually-hidden', `Estado de «${task.title}»`));

  const select = el('select');
  select.dataset.control = 'status';
  for (const [value, label] of Object.entries(STATUS_LABELS)) {
    const option = el('option', '', label);
    option.value = value;
    option.selected = value === task.status;
    select.append(option);
  }
  select.addEventListener('change', () => onStatusChange(task, select.value));
  wrapper.append(select);
  return wrapper;
}

function buildTaskItem(task, handlers) {
  const item = el('li', `task task-${task.status}`);
  item.dataset.taskId = task.id;

  const article = el('article');

  const header = el('div', 'task-header');
  header.append(el('h3', 'task-title', task.title));
  const badges = el('p', 'task-badges');
  badges.append(el('span', `badge badge-status-${task.status}`, STATUS_LABELS[task.status]));
  badges.append(el('span', `badge badge-priority-${task.priority}`, `Prioridad ${PRIORITY_LABELS[task.priority].toLowerCase()}`));
  header.append(badges);
  article.append(header);

  if (task.description) {
    article.append(el('p', 'task-description', task.description));
  }

  const meta = el('p', 'task-meta');
  if (task.dueDate) {
    const due = el('span', '', 'Fecha límite: ');
    const time = el('time', '', formatDate(task.dueDate));
    time.dateTime = task.dueDate;
    due.append(time);
    if (task.status !== 'completed' && task.dueDate < todayIso()) {
      due.append(' ', el('strong', 'overdue', '(vencida)'));
    }
    meta.append(due);
  } else {
    meta.append(el('span', '', 'Sin fecha límite'));
  }
  article.append(meta);

  const actions = el('div', 'task-actions');
  actions.append(buildStatusSelect(task, handlers.onStatusChange));

  const editButton = el('button', 'button', 'Editar');
  editButton.type = 'button';
  editButton.setAttribute('aria-label', `Editar «${task.title}»`);
  editButton.addEventListener('click', () => handlers.onEdit(task));

  const deleteButton = el('button', 'button button-danger', 'Eliminar');
  deleteButton.type = 'button';
  deleteButton.setAttribute('aria-label', `Eliminar «${task.title}»`);
  deleteButton.addEventListener('click', () => handlers.onDelete(task));

  actions.append(editButton, deleteButton);
  article.append(actions);

  item.append(article);
  return item;
}

// handlers: { onEdit(task), onDelete(task), onStatusChange(task, newStatus) }
export function renderTasks(tasks, handlers, hasActiveFilters) {
  const list = $('task-list');
  list.replaceChildren(...tasks.map((task) => buildTaskItem(task, handlers)));

  if (tasks.length === 0) {
    setListStatus(hasActiveFilters
      ? 'Ninguna tarea coincide con los filtros.'
      : 'Todavía no hay tareas. Crea la primera con el formulario.');
  } else {
    setListStatus(tasks.length === 1 ? 'Se muestra 1 tarea.' : `Se muestran ${tasks.length} tareas.`);
  }
}

// Devuelve el foco al selector de estado de una tarea después de volver a pintar la lista.
export function focusTaskStatus(taskId) {
  // El id puede ser un número (API) o un texto (modo invitado): se compara como texto.
  const item = [...document.querySelectorAll('[data-task-id]')]
    .find((node) => node.dataset.taskId === String(taskId));
  const select = item && item.querySelector('[data-control="status"]');
  if (select) select.focus();
}

export function focusListHeading() {
  $('tasks-heading').focus();
}

/* ---------- Formulario ---------- */

export function readForm() {
  const form = $('task-form');
  return {
    title: form.elements.title.value,
    description: form.elements.description.value,
    status: form.elements.status.value,
    priority: form.elements.priority.value,
    dueDate: form.elements.dueDate.value || null,
  };
}

export function clearFieldErrors() {
  const form = $('task-form');
  for (const field of FORM_FIELDS) {
    $(`error-${field}`).textContent = '';
    form.elements[field].removeAttribute('aria-invalid');
  }
}

// details: [{ field, message }] tal como lo devuelve el almacén de tareas. Devuelve true si mostró alguno.
export function showFieldErrors(details = []) {
  const form = $('task-form');
  let firstInvalid = null;
  for (const { field, message } of details) {
    if (!FORM_FIELDS.includes(field)) continue;
    $(`error-${field}`).textContent = message;
    form.elements[field].setAttribute('aria-invalid', 'true');
    firstInvalid = firstInvalid || form.elements[field];
  }
  if (firstInvalid) firstInvalid.focus();
  return firstInvalid !== null;
}

export function setFormBusy(isBusy) {
  $('submit-button').disabled = isBusy;
}

export function startEditing(task) {
  const form = $('task-form');
  clearFieldErrors();
  form.elements.title.value = task.title;
  form.elements.description.value = task.description || '';
  form.elements.status.value = task.status;
  form.elements.priority.value = task.priority;
  form.elements.dueDate.value = task.dueDate || '';

  $('form-heading').textContent = 'Editar tarea';
  $('submit-button').textContent = 'Guardar cambios';
  $('cancel-edit-button').hidden = false;

  $('form-heading').scrollIntoView({ block: 'start' });
  form.elements.title.focus();
}

export function resetForm() {
  $('task-form').reset();
  clearFieldErrors();
  $('form-heading').textContent = 'Nueva tarea';
  $('submit-button').textContent = 'Crear tarea';
  $('cancel-edit-button').hidden = true;
}

/* ---------- Filtros ---------- */

export function readFilters() {
  const form = $('filters-form');
  const [sort, order] = form.elements.sort.value.split(':');
  return {
    q: form.elements.q.value.trim(),
    status: form.elements.status.value,
    priority: form.elements.priority.value,
    sort,
    order,
  };
}
