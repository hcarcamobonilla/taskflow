// Modo invitado: recuerda, dentro de la pestaña, si el visitante ya pulsó
// "Entrar como invitado". No es autenticación: no hay cuentas, contraseñas ni servidor.

import { StoreError } from './store/StoreError.js';

// Clave propia de TaskFlow (misma familia que la de las tareas).
export const GUEST_KEY = 'taskflow.guest.active';

const BLOCKED_MESSAGE =
  'Tu navegador no permite guardar datos temporales, así que el modo invitado no puede iniciarse. Revisa la configuración de privacidad o prueba en otra ventana.';

export function isGuestActive() {
  try {
    return globalThis.sessionStorage.getItem(GUEST_KEY) === '1';
  } catch {
    return false;
  }
}

export function startGuest() {
  try {
    globalThis.sessionStorage.setItem(GUEST_KEY, '1');
  } catch {
    throw new StoreError(BLOCKED_MESSAGE);
  }
}

export function endGuest() {
  try {
    globalThis.sessionStorage.removeItem(GUEST_KEY);
  } catch {
    throw new StoreError(BLOCKED_MESSAGE);
  }
}
