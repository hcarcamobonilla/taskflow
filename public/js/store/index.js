// Selección del adaptador de almacenamiento.
//
// Los dos adaptadores exportan las mismas funciones, todas asíncronas:
//
//   listTasks(filters)            -> { data: [tarea], meta: { total, countsByStatus } }
//   getTask(id)                   -> tarea
//   createTask(task)              -> tarea creada
//   updateTask(id, task)          -> tarea actualizada
//   updateTaskStatus(id, status)  -> tarea actualizada
//   deleteTask(id)                -> null
//
// Si algo falla lanzan StoreError. El resto del frontend (main.js, ui.js) solo usa
// estas funciones y no sabe si detrás hay una API o el navegador.

// Se usa import() dinámico para descargar únicamente el adaptador elegido:
// la demo web nunca carga el código que llama a la API.
const ADAPTERS = {
  api: () => import('./apiStore.js'),
  session: () => import('./sessionStore.js'),
};

export async function loadStore(mode) {
  const load = ADAPTERS[mode];
  if (!load) {
    throw new Error(`Modo de almacenamiento desconocido: ${mode}`);
  }
  return load();
}
