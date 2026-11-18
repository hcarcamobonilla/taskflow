// Tablero Kanban en la versión local: columnas y tarjetas viven en PostgreSQL y se
// accede a ellas mediante la API REST. Misma interfaz que sessionKanban.js.

import { request as httpRequest } from './http.js';

const BASE_URL = '/api/kanban';

// Las respuestas con datos llegan como { data: ... }; las 204 (sin contenido) como null.
async function request(path, options) {
  const payload = await httpRequest(BASE_URL + path, options);
  return payload ? payload.data : null;
}

export function getBoard() {
  return request('');
}

export function updateProject(project) {
  return request('/project', { method: 'PUT', body: project });
}

/* ---------- Columnas ---------- */

export function createColumn(column) {
  return request('/columns', { method: 'POST', body: column });
}

export function duplicateColumn(id) {
  return request(`/columns/${id}/duplicate`, { method: 'POST' });
}

export function updateColumn(id, column) {
  return request(`/columns/${id}`, { method: 'PUT', body: column });
}

export function moveColumn(id, position) {
  return request(`/columns/${id}/move`, { method: 'PATCH', body: { position } });
}

export function deleteColumn(id) {
  return request(`/columns/${id}`, { method: 'DELETE' });
}

export function clearColumn(id) {
  return request(`/columns/${id}/cards`, { method: 'DELETE' });
}

export function moveAllCards(id, targetColumnId) {
  return request(`/columns/${id}/move-cards`, { method: 'POST', body: { targetColumnId } });
}

/* ---------- Tarjetas ---------- */

export function createCard(columnId, card) {
  return request(`/columns/${columnId}/cards`, { method: 'POST', body: card });
}

export function updateCard(id, card) {
  return request(`/cards/${id}`, { method: 'PUT', body: card });
}

// Completa la tarea: se elimina y suma al contador. Devuelve el proyecto con el contador nuevo.
export function completeCard(id) {
  return request(`/cards/${id}/complete`, { method: 'POST' });
}

export function duplicateCard(id) {
  return request(`/cards/${id}/duplicate`, { method: 'POST' });
}

// Sin `position`, la tarjeta va al final de la columna de destino.
export function moveCard(id, columnId, position) {
  return request(`/cards/${id}/move`, { method: 'PATCH', body: { columnId, position } });
}

export function deleteCard(id) {
  return request(`/cards/${id}`, { method: 'DELETE' });
}
