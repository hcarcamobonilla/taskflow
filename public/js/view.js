// Vista elegida para organizar las tareas: 'list' (lista TaskFlow) o 'kanban' (tablero).
// Es una preferencia de la interfaz, no un dato de negocio: se recuerda en sessionStorage
// mientras dure la pestaña. Si el navegador no deja guardarla, la aplicación sigue
// funcionando y simplemente no la recuerda.

export const VIEW_KEY = 'taskflow.view';
export const VIEWS = ['list', 'kanban'];

// Devuelve la vista guardada, o null si todavía no se eligió ninguna.
export function getView() {
  try {
    const view = globalThis.sessionStorage.getItem(VIEW_KEY);
    return VIEWS.includes(view) ? view : null;
  } catch {
    return null;
  }
}

export function setView(view) {
  try {
    globalThis.sessionStorage.setItem(VIEW_KEY, view);
  } catch {
    // Sin almacenamiento no se recuerda la vista; no es un error para el usuario.
  }
}

export function clearView() {
  try {
    globalThis.sessionStorage.removeItem(VIEW_KEY);
  } catch {
    // Nada que borrar.
  }
}
