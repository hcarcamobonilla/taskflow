// Reglas de las tareas para el modo invitado: validación, filtros, búsqueda, orden y recuentos.
//
// En la versión local estas reglas las aplica el servidor (src/validators/tasks.validator.js
// y src/repositories/tasks.repository.js). Aquí se repiten en JavaScript de navegador para
// que la demo se comporte igual sin backend. La prueba tests/store-parity.test.js ejecuta
// los mismos casos contra ambas implementaciones para detectar diferencias.

import { StoreError } from './StoreError.js';

export const STATUSES = ['pending', 'in_progress', 'completed'];
export const PRIORITIES = ['low', 'medium', 'high'];
const SORT_FIELDS = ['created_at', 'due_date', 'priority'];
const SORT_ORDERS = ['asc', 'desc'];

const TITLE_MAX = 150;
const DESCRIPTION_MAX = 2000;
const SEARCH_MAX = 100;
const PRIORITY_RANK = { low: 1, medium: 2, high: 3 };

function fail(details) {
  throw new StoreError('Datos de entrada no válidos', 400, details);
}

function isEmpty(value) {
  return value === undefined || value === null || value === '';
}

// Comprueba formato YYYY-MM-DD y que la fecha exista en el calendario (rechaza 2026-02-30).
export function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/* ---------- Validación ---------- */

// Devuelve la tarea limpia (con valores por defecto) o lanza StoreError 400 con el detalle por campo.
export function validateTask(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    fail([{ field: 'body', message: 'El cuerpo debe ser un objeto JSON' }]);
  }

  const errors = [];
  const task = {};

  if (typeof body.title !== 'string' || body.title.trim() === '') {
    errors.push({ field: 'title', message: 'El título es obligatorio' });
  } else if (body.title.trim().length > TITLE_MAX) {
    errors.push({ field: 'title', message: `El título admite como máximo ${TITLE_MAX} caracteres` });
  } else {
    task.title = body.title.trim();
  }

  if (isEmpty(body.description)) {
    task.description = null;
  } else if (typeof body.description !== 'string') {
    errors.push({ field: 'description', message: 'La descripción debe ser texto' });
  } else if (body.description.trim().length > DESCRIPTION_MAX) {
    errors.push({ field: 'description', message: `La descripción admite como máximo ${DESCRIPTION_MAX} caracteres` });
  } else {
    task.description = body.description.trim() || null;
  }

  if (body.status === undefined) {
    task.status = 'pending';
  } else if (!STATUSES.includes(body.status)) {
    errors.push({ field: 'status', message: `El estado debe ser uno de: ${STATUSES.join(', ')}` });
  } else {
    task.status = body.status;
  }

  if (body.priority === undefined) {
    task.priority = 'medium';
  } else if (!PRIORITIES.includes(body.priority)) {
    errors.push({ field: 'priority', message: `La prioridad debe ser una de: ${PRIORITIES.join(', ')}` });
  } else {
    task.priority = body.priority;
  }

  if (isEmpty(body.dueDate)) {
    task.dueDate = null;
  } else if (!isValidDate(body.dueDate)) {
    errors.push({ field: 'dueDate', message: 'La fecha límite debe ser una fecha válida con formato YYYY-MM-DD' });
  } else {
    task.dueDate = body.dueDate;
  }

  if (errors.length > 0) fail(errors);
  return task;
}

export function validateStatus(status) {
  if (!STATUSES.includes(status)) {
    fail([{ field: 'status', message: `El estado debe ser uno de: ${STATUSES.join(', ')}` }]);
  }
  return status;
}

// Valida los filtros de la lista. Solo se aceptan valores de listas blancas.
export function validateFilters(query = {}) {
  const errors = [];
  const filters = { sort: 'created_at', order: 'desc' };

  const checkOption = (name, allowed) => {
    const value = query[name];
    if (value === undefined || value === '') return;
    if (typeof value !== 'string' || !allowed.includes(value)) {
      errors.push({ field: name, message: `Valor no permitido. Opciones: ${allowed.join(', ')}` });
    } else {
      filters[name] = value;
    }
  };

  checkOption('status', STATUSES);
  checkOption('priority', PRIORITIES);
  checkOption('sort', SORT_FIELDS);
  checkOption('order', SORT_ORDERS);

  if (query.q !== undefined && query.q !== '') {
    if (typeof query.q !== 'string' || query.q.trim().length > SEARCH_MAX) {
      errors.push({ field: 'q', message: `La búsqueda debe ser texto de hasta ${SEARCH_MAX} caracteres` });
    } else if (query.q.trim() !== '') {
      filters.q = query.q.trim();
    }
  }

  if (errors.length > 0) fail(errors);
  return filters;
}

/* ---------- Filtros, búsqueda y orden ---------- */

function matches(task, { status, priority, q }) {
  if (status && task.status !== status) return false;
  if (priority && task.priority !== priority) return false;
  if (q) {
    const needle = q.toLowerCase();
    const inTitle = task.title.toLowerCase().includes(needle);
    const inDescription = (task.description || '').toLowerCase().includes(needle);
    if (!inTitle && !inDescription) return false;
  }
  return true;
}

// Valor por el que se ordena cada tarea; null significa "sin valor" y va siempre al final.
const SORT_VALUE = {
  created_at: (task) => task.createdAt,
  due_date: (task) => task.dueDate,
  priority: (task) => PRIORITY_RANK[task.priority],
};

function compareValues(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

// tasks debe venir en orden de creación (la más antigua primero).
// Equivale a: WHERE ... ORDER BY <campo> <dirección> NULLS LAST, id DESC
export function filterAndSort(tasks, filters) {
  const valueOf = SORT_VALUE[filters.sort] || SORT_VALUE.created_at;
  const direction = filters.order === 'asc' ? 1 : -1;

  return tasks
    .map((task, position) => ({ task, position }))
    .filter(({ task }) => matches(task, filters))
    .sort((a, b) => {
      const valueA = valueOf(a.task);
      const valueB = valueOf(b.task);
      if (valueA === null && valueB !== null) return 1;
      if (valueA !== null && valueB === null) return -1;
      if (valueA !== null && valueB !== null) {
        const result = compareValues(valueA, valueB) * direction;
        if (result !== 0) return result;
      }
      return b.position - a.position; // en caso de empate, la más reciente primero
    })
    .map(({ task }) => task);
}

/* ---------- Estadísticas ---------- */

export function countByStatus(tasks) {
  const counts = { pending: 0, in_progress: 0, completed: 0 };
  for (const task of tasks) counts[task.status] += 1;
  return counts;
}
