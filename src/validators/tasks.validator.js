// Validación de la entrada del usuario (cuerpo, parámetros y query string).
// Cada función devuelve datos limpios o lanza HttpError 400 con el detalle por campo.

const HttpError = require('../utils/HttpError');

const STATUSES = ['pending', 'in_progress', 'completed'];
const PRIORITIES = ['low', 'medium', 'high'];
const SORT_FIELDS = ['created_at', 'due_date', 'priority'];
const SORT_ORDERS = ['asc', 'desc'];

const TITLE_MAX = 150;
const DESCRIPTION_MAX = 2000;
const SEARCH_MAX = 100;
const MAX_INT = 2147483647; // límite del tipo INTEGER de PostgreSQL

function fail(details) {
  throw new HttpError(400, 'Datos de entrada no válidos', details);
}

function parseId(raw) {
  const id = Number(raw);
  if (!/^\d+$/.test(String(raw)) || id < 1 || id > MAX_INT) {
    fail([{ field: 'id', message: 'El id debe ser un entero positivo' }]);
  }
  return id;
}

// Comprueba formato YYYY-MM-DD y que la fecha exista en el calendario (rechaza 2026-02-30).
function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isEmpty(value) {
  return value === undefined || value === null || value === '';
}

// Valida una tarea completa (POST y PUT). Los campos opcionales ausentes toman su valor por defecto.
function validateTask(body) {
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

function validateStatus(body) {
  if (body === null || typeof body !== 'object' || !STATUSES.includes(body.status)) {
    fail([{ field: 'status', message: `El estado debe ser uno de: ${STATUSES.join(', ')}` }]);
  }
  return body.status;
}

// Valida los filtros de GET /api/tasks. Solo se aceptan valores de listas blancas.
function validateListQuery(query) {
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

module.exports = {
  STATUSES,
  PRIORITIES,
  parseId,
  isValidDate,
  validateTask,
  validateStatus,
  validateListQuery,
};
