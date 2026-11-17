// Lectura y escritura segura de sessionStorage, compartida por los adaptadores del modo
// invitado (sessionStore.js para las tareas y sessionKanban.js para el tablero).
// Cada clave guarda un valor en formato JSON.

import { StoreError } from './StoreError.js';

const BLOCKED_MESSAGE =
  'Tu navegador no permite guardar datos temporales. Revisa la configuración de privacidad o prueba en otra ventana.';
const CORRUPT_MESSAGE =
  'Los datos guardados en este navegador están dañados y no se pueden leer. Usa «Salir y borrar mis datos» para empezar de nuevo.';
const FULL_MESSAGE =
  'No queda espacio para guardar más datos en este navegador. Elimina algunas tareas e inténtalo de nuevo.';

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

function isQuotaError(error) {
  return (
    error &&
    (error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error.code === 22)
  );
}

export function corruptDataError() {
  return new StoreError(CORRUPT_MESSAGE);
}

// Devuelve el valor guardado en `key`, o null si todavía no hay nada.
export function readJson(key) {
  const storage = getStorage();

  let raw;
  try {
    raw = storage.getItem(key);
  } catch {
    throw new StoreError(BLOCKED_MESSAGE);
  }
  if (raw === null) return null;

  try {
    return JSON.parse(raw);
  } catch {
    throw corruptDataError();
  }
}

export function writeJson(key, value) {
  const storage = getStorage();
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch (error) {
    throw new StoreError(isQuotaError(error) ? FULL_MESSAGE : BLOCKED_MESSAGE);
  }
}

// Borra la clave. Funciona aunque su contenido esté dañado.
export function removeKey(key) {
  const storage = getStorage();
  try {
    storage.removeItem(key);
  } catch {
    throw new StoreError(BLOCKED_MESSAGE);
  }
}

export function newId() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  // randomUUID solo existe en contextos seguros (HTTPS o localhost); esto cubre el resto.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function now() {
  return new Date().toISOString();
}
