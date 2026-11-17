// Punto de entrada del frontend: conecta los eventos de la página con el almacén de
// tareas (API o sessionStorage, según config.js) y con la interfaz.

import { STORAGE_MODE } from './config.js';
import { loadStore } from './store/index.js';
import * as guest from './guest.js';
import * as view from './view.js';
import * as kanban from './kanban.js';
import * as ui from './ui.js';

const taskForm = document.getElementById('task-form');
const filtersForm = document.getElementById('filters-form');
const cancelEditButton = document.getElementById('cancel-edit-button');
const enterGuestButton = document.getElementById('enter-guest-button');
const exitGuestButton = document.getElementById('exit-guest-button');
const viewChooser = document.getElementById('view-chooser');
const viewSwitch = document.getElementById('view-switch');

// En la demo web las tareas se guardan en el navegador y hay pantalla de bienvenida.
const isGuestMode = STORAGE_MODE === 'session';

// Adaptador de almacenamiento elegido; se carga en start().
let store = null;

// Id de la tarea que se está editando; null cuando el formulario crea una tarea nueva.
let editingId = null;

// Número de la última carga pedida: si llegan respuestas desordenadas, solo se pinta la más reciente.
let lastLoadId = 0;

const taskHandlers = {
  onEdit: handleEdit,
  onDelete: handleDelete,
  onStatusChange: handleStatusChange,
};

async function loadTasks() {
  // En la demo no se lee nada hasta que el visitante entra como invitado.
  if (isGuestMode && !guest.isGuestActive()) return;

  const loadId = ++lastLoadId;
  const filters = ui.readFilters();
  ui.setListLoading(true);

  try {
    const { data, meta } = await store.listTasks(filters);
    if (loadId !== lastLoadId) return;
    const hasActiveFilters = Boolean(filters.q || filters.status || filters.priority);
    ui.renderDashboard(meta.countsByStatus);
    ui.renderTasks(data, taskHandlers, hasActiveFilters);
  } catch (error) {
    if (loadId !== lastLoadId) return;
    ui.setListStatus('No se pudieron cargar las tareas.');
    ui.showMessage(error.message, 'error');
  } finally {
    if (loadId === lastLoadId) ui.setListLoading(false);
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  ui.clearFieldErrors();
  ui.clearMessage();

  const task = ui.readForm();
  // Validación rápida en la página; el almacén vuelve a validar todo.
  if (task.title.trim() === '') {
    ui.showFieldErrors([{ field: 'title', message: 'El título es obligatorio' }]);
    return;
  }

  ui.setFormBusy(true);
  try {
    if (editingId === null) {
      await store.createTask(task);
      ui.showMessage('Tarea creada correctamente.');
    } else {
      await store.updateTask(editingId, task);
      ui.showMessage('Cambios guardados correctamente.');
    }
    editingId = null;
    ui.resetForm();
    await loadTasks();
  } catch (error) {
    const shownInFields = ui.showFieldErrors(error.details);
    ui.showMessage(shownInFields ? 'Revisa los campos marcados.' : error.message, 'error');
    if (error.status === 404) {
      // La tarea que se editaba ya no existe (por ejemplo, se eliminó en otra pestaña).
      editingId = null;
      ui.resetForm();
      await loadTasks();
    }
  } finally {
    ui.setFormBusy(false);
  }
}

function handleEdit(task) {
  editingId = task.id;
  ui.clearMessage();
  ui.startEditing(task);
}

function handleCancelEdit() {
  editingId = null;
  ui.resetForm();
}

async function handleDelete(task) {
  const confirmed = window.confirm(`¿Eliminar la tarea «${task.title}»? Esta acción no se puede deshacer.`);
  if (!confirmed) return;

  try {
    await store.deleteTask(task.id);
    if (editingId === task.id) handleCancelEdit();
    ui.showMessage('Tarea eliminada.');
  } catch (error) {
    ui.showMessage(error.message, 'error');
  }
  await loadTasks();
  ui.focusListHeading();
}

async function handleStatusChange(task, newStatus) {
  try {
    await store.updateTaskStatus(task.id, newStatus);
    ui.showMessage(`Estado cambiado a «${ui.STATUS_LABELS[newStatus]}».`);
  } catch (error) {
    ui.showMessage(error.message, 'error');
  }
  // Se recarga siempre: si hubo error, la lista vuelve a mostrar el estado real.
  await loadTasks();
  ui.focusTaskStatus(task.id);
}

/* ---------- Vistas: lista o tablero Kanban ---------- */

// Muestra la vista pedida y carga sus datos. Cada vista se carga al mostrarse,
// así siempre refleja lo que hay guardado.
function openView(name) {
  ui.showView(name);
  if (name === 'kanban') {
    kanban.load();
  } else {
    loadTasks();
  }
}

// Botones "Lista" y "Tablero Kanban" de la aplicación.
function handleSwitchView(event) {
  const button = event.target.closest('[data-view]');
  if (!button) return;
  ui.clearMessage();
  view.setView(button.dataset.view);
  openView(button.dataset.view);
}

/* ---------- Modo invitado (solo demo web) ---------- */

// Tras entrar, el invitado elige primero cómo quiere organizar sus tareas.
function handleEnterGuest() {
  try {
    guest.startGuest();
  } catch (error) {
    ui.showWelcomeError(error.message);
    return;
  }
  ui.showViewChooser();
}

// Botones de la pantalla de elección de vista.
function handleChooseView(event) {
  const button = event.target.closest('[data-view]');
  if (!button) return;
  view.setView(button.dataset.view);
  ui.showApp({ isGuest: true });
  openView(button.dataset.view);
  ui.focusGuestExit();
}

async function handleExitGuest() {
  const confirmed = window.confirm(
    '¿Salir del modo invitado? Se borrarán todas tus tareas de este navegador y no podrás recuperarlas.'
  );
  if (!confirmed) return;

  try {
    await store.clearAll();
    guest.endGuest();
  } catch (error) {
    ui.showMessage(error.message, 'error');
    return;
  }

  view.clearView();
  editingId = null;
  lastLoadId += 1; // descarta cualquier carga de tareas que siguiera en curso
  ui.clearScreen();
  kanban.clearScreen();
  ui.showWelcome();
  ui.focusWelcome();
}

/* ---------- Arranque ---------- */

// Espera a que el usuario deje de escribir antes de buscar.
function debounce(fn, delayMs) {
  let timer;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, delayMs);
  };
}

function bindEvents() {
  taskForm.addEventListener('submit', handleSubmit);
  cancelEditButton.addEventListener('click', handleCancelEdit);

  filtersForm.addEventListener('submit', (event) => {
    event.preventDefault();
    loadTasks();
  });
  filtersForm.addEventListener('change', loadTasks);
  filtersForm.elements.q.addEventListener('input', debounce(loadTasks, 300));
  // reset restaura los valores después de disparar el evento; se espera un instante para leerlos.
  filtersForm.addEventListener('reset', () => setTimeout(loadTasks, 0));

  enterGuestButton.addEventListener('click', handleEnterGuest);
  exitGuestButton.addEventListener('click', handleExitGuest);
  viewChooser.addEventListener('click', handleChooseView);
  viewSwitch.addEventListener('click', handleSwitchView);
}

async function start() {
  store = await loadStore(STORAGE_MODE);
  bindEvents();
  kanban.init(store);

  // Vista recordada en esta pestaña (null si todavía no se eligió ninguna).
  const savedView = view.getView();

  if (!isGuestMode) {
    // Versión local: se entra directamente a la aplicación; por defecto, a la lista.
    ui.showApp({ isGuest: false });
    openView(savedView || 'list');
  } else if (!guest.isGuestActive()) {
    ui.showWelcome();
  } else if (savedView) {
    // El invitado recargó la página: sigue dentro, en la vista que tenía.
    ui.showApp({ isGuest: true });
    openView(savedView);
  } else {
    // Entró como invitado pero recargó antes de elegir vista.
    ui.showViewChooser();
  }
}

start().catch((error) => {
  // Solo ocurre si no se puede cargar el código de la aplicación (por ejemplo, sin red).
  console.error(error);
  ui.showApp({ isGuest: false });
  ui.showView('list');
  ui.setListStatus('');
  ui.showMessage('No se pudo iniciar la aplicación. Recarga la página.', 'error');
});
