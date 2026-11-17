// Adaptador de sessionStorage: las tareas viven solo en el navegador del visitante.
// No hace ninguna petición de red. Se usa en la demo web (modo invitado).
//
// Cada operación lee la lista completa de sessionStorage y, si la cambia, la vuelve a
// guardar. No se mantiene una copia en memoria: así lo que se ve siempre coincide con
// lo que hay guardado.

import { StoreError } from './StoreError.js';
import { readJson, writeJson, removeKey, corruptDataError, newId, now } from './sessionAccess.js';
import { KANBAN_KEY } from './sessionKanban.js';
import {
  validateTask,
  validateStatus,
  validateFilters,
  filterAndSort,
  countByStatus,
  STATUSES,
  PRIORITIES,
} from './taskRules.js';

// El tablero Kanban forma parte de la misma interfaz del almacén.
export * from './sessionKanban.js';

// Clave propia de TaskFlow: nunca se toca ningún otro dato del mismo origen.
export const TASKS_KEY = 'taskflow.guest.tasks';

/* ---------- Lectura y escritura ---------- */

function looksLikeTask(item) {
  return (
    item !== null &&
    typeof item === 'object' &&
    typeof item.id === 'string' &&
    typeof item.title === 'string' &&
    typeof item.createdAt === 'string' &&
    STATUSES.includes(item.status) &&
    PRIORITIES.includes(item.priority)
  );
}

// Devuelve las tareas en orden de creación (la más antigua primero).
function readTasks() {
  const tasks = readJson(TASKS_KEY);
  if (tasks === null) return [];
  if (!Array.isArray(tasks) || !tasks.every(looksLikeTask)) throw corruptDataError();
  return tasks;
}

function writeTasks(tasks) {
  writeJson(TASKS_KEY, tasks);
}

function findIndexOrFail(tasks, id) {
  const index = tasks.findIndex((task) => task.id === String(id));
  if (index === -1) throw new StoreError('Tarea no encontrada', 404);
  return index;
}

/* ---------- Interfaz común (la misma que apiStore.js) ---------- */

export async function listTasks(filters = {}) {
  const cleanFilters = validateFilters(filters);
  const tasks = readTasks();
  const data = filterAndSort(tasks, cleanFilters);
  // countsByStatus cuenta TODAS las tareas (para el dashboard); total cuenta las filtradas.
  return { data, meta: { total: data.length, countsByStatus: countByStatus(tasks) } };
}

export async function getTask(id) {
  const tasks = readTasks();
  return tasks[findIndexOrFail(tasks, id)];
}

export async function createTask(input) {
  const fields = validateTask(input);
  const tasks = readTasks();
  const timestamp = now();
  const task = { id: newId(), ...fields, createdAt: timestamp, updatedAt: timestamp };
  tasks.push(task);
  writeTasks(tasks);
  return task;
}

export async function updateTask(id, input) {
  const tasks = readTasks();
  const index = findIndexOrFail(tasks, id);
  const fields = validateTask(input);
  tasks[index] = { ...tasks[index], ...fields, updatedAt: now() };
  writeTasks(tasks);
  return tasks[index];
}

export async function updateTaskStatus(id, status) {
  const tasks = readTasks();
  const index = findIndexOrFail(tasks, id);
  tasks[index] = { ...tasks[index], status: validateStatus(status), updatedAt: now() };
  writeTasks(tasks);
  return tasks[index];
}

export async function deleteTask(id) {
  const tasks = readTasks();
  tasks.splice(findIndexOrFail(tasks, id), 1);
  writeTasks(tasks);
  return null;
}

/* ---------- Solo modo invitado ---------- */

// Borra todos los datos del invitado (tareas y tablero Kanban).
// Funciona aunque los datos estén dañados.
export async function clearAll() {
  removeKey(TASKS_KEY);
  removeKey(KANBAN_KEY);
}
