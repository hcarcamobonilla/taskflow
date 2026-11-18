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
// y las del tablero Kanban (apiKanban.js y sessionKanban.js):
//
//   getBoard()                           -> { project: { name, description }, columns: [columna con sus tarjetas en `cards`] }
//   updateProject({ name, description }) -> proyecto actualizado
//   createColumn({ name, position })     -> columna creada (sin position, al final)
//   duplicateColumn(id)                  -> copia de la columna con sus tarjetas, a su derecha
//   updateColumn(id, { name })           -> columna actualizada
//   moveColumn(id, position)             -> tablero completo
//   deleteColumn(id)                     -> null (elimina también sus tarjetas)
//   clearColumn(id)                      -> null (elimina solo sus tarjetas)
//   moveAllCards(id, targetColumnId)     -> tablero completo
//   createCard(columnId, card)           -> tarjeta creada
//   updateCard(id, card)                 -> tarjeta actualizada
//   setCardCompleted(id, completed)      -> tarjeta actualizada (marca o desmarca «completada»)
//   duplicateCard(id)                    -> copia de la tarjeta, justo debajo de la original
//   moveCard(id, columnId, position)     -> tarjeta movida
//   deleteCard(id)                       -> null
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
