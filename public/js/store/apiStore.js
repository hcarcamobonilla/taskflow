// Adaptador de API: las tareas viven en PostgreSQL y se accede a ellas
// mediante peticiones HTTP (Fetch API) al backend Express.

import { StoreError } from './StoreError.js';

const BASE_URL = '/api/tasks';

async function request(path = '', { method = 'GET', body } = {}) {
  const options = { method, headers: { Accept: 'application/json' } };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(BASE_URL + path, options);
  } catch {
    // fetch solo rechaza la promesa si no hay conexión (servidor apagado, sin red...).
    throw new StoreError('No se pudo conectar con el servidor. Comprueba que esté en marcha.', 0);
  }

  if (response.status === 204) return null;

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // La respuesta no era JSON; se trata más abajo como error genérico.
  }

  if (!response.ok) {
    const error = payload && payload.error ? payload.error : {};
    throw new StoreError(error.message || `Error inesperado (${response.status})`, response.status, error.details);
  }
  return payload;
}

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
