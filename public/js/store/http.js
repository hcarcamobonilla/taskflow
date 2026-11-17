// Peticiones HTTP al backend (Fetch API). Lo usan los adaptadores de la versión local
// (apiStore.js y apiKanban.js); la demo web no incluye este archivo.

import { StoreError } from './StoreError.js';

// Devuelve el JSON de la respuesta (o null si no trae contenido) y lanza StoreError si falla.
export async function request(url, { method = 'GET', body } = {}) {
  const options = { method, headers: { Accept: 'application/json' } };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(url, options);
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
