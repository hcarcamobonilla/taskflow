// Adaptador de API: las tareas viven en PostgreSQL y se accede a ellas
// mediante peticiones HTTP (Fetch API) al backend Express.

import { request as httpRequest } from './http.js';

// El tablero Kanban forma parte de la misma interfaz del almacén.
export * from './apiKanban.js';

const BASE_URL = '/api/tasks';

const request = (path = '', options) => httpRequest(BASE_URL + path, options);

// filters: { q, status, priority, sort, order }. Los valores vacíos no se envían.
export function listTasks(filters = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return request(query ? `?${query}` : '');
}

export async function getTask(id) {
  return (await request(`/${id}`)).data;
}

export async function createTask(task) {
  return (await request('', { method: 'POST', body: task })).data;
}

export async function updateTask(id, task) {
  return (await request(`/${id}`, { method: 'PUT', body: task })).data;
}

export async function updateTaskStatus(id, status) {
  return (await request(`/${id}/status`, { method: 'PATCH', body: { status } })).data;
}

export function deleteTask(id) {
  return request(`/${id}`, { method: 'DELETE' });
}
