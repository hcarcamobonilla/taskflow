// Adaptador de sessionStorage: las tareas viven solo en el navegador del visitante.
// No hace ninguna petición de red. Se usa en la demo web (modo invitado).
//
// Cada operación lee la lista completa de sessionStorage y, si la cambia, la vuelve a
// guardar. No se mantiene una copia en memoria: así lo que se ve siempre coincide con
// lo que hay guardado.

import { StoreError } from './StoreError.js';
import {
  validateTask,
  validateStatus,
  validateFilters,
  filterAndSort,
  countByStatus,
  STATUSES,
  PRIORITIES,
} from './taskRules.js';

// Clave propia de TaskFlow: nunca se toca ningún otro dato del mismo origen.
export const TASKS_KEY = 'taskflow.guest.tasks';

const BLOCKED_MESSAGE =
  'Tu navegador no permite guardar datos temporales. Revisa la configuración de privacidad o prueba en otra ventana.';
const CORRUPT_MESSAGE =
  'Los datos guardados en este navegador están dañados y no se pueden leer. Usa «Salir y borrar mis datos» para empezar de nuevo.';
const FULL_MESSAGE =
  'No queda espacio para guardar más datos en este navegador. Elimina algunas tareas e inténtalo de nuevo.';

/* ---------- Acceso a sessionStorage ---------- */

function getStorage() {
  // Con el almacenamiento bloqueado, el simple acceso a la propiedad puede lanzar un error.
  try {
    const storage = globalThis.sessionStorage;
    if (storage) return storage;
  } catch {
    // Se trata igual que si no existiera.
  }
  throw new StoreError(BLOCKED_MESSAGE);
}

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
  const storage = getStorage();

  let raw;
  try {
    raw = storage.getItem(TASKS_KEY);
  } catch {
    throw new StoreError(BLOCKED_MESSAGE);
  }
  if (raw === null) return [];

  let tasks;
  try {
    tasks = JSON.parse(raw);
  } catch {
    throw new StoreError(CORRUPT_MESSAGE);
  }
  if (!Array.isArray(tasks) || !tasks.every(looksLikeTask)) {
    throw new StoreError(CORRUPT_MESSAGE);
  }
  return tasks;
}

function isQuotaError(error) {
  return (
    error &&
    (error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error.code === 22)
  );
}

function writeTasks(tasks) {
  const storage = getStorage();
  try {
    storage.setItem(TASKS_KEY, JSON.stringify(tasks));
  } catch (error) {
    throw new StoreError(isQuotaError(error) ? FULL_MESSAGE : BLOCKED_MESSAGE);
  }
}

/* ---------- Utilidades ---------- */

function newId() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  // randomUUID solo existe en contextos seguros (HTTPS o localhost); esto cubre el resto.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function now() {
  return new Date().toISOString();
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

// Borra todas las tareas del invitado. Funciona aunque los datos estén dañados.
export async function clearAll() {
  const storage = getStorage();
  try {
    storage.removeItem(TASKS_KEY);
  } catch {
    throw new StoreError(BLOCKED_MESSAGE);
  }
}
