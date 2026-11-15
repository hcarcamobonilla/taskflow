// sessionStorage de mentira para probar en Node el código del navegador.
// Implementa la parte de la API Web Storage que usa TaskFlow.

class FakeStorage {
  constructor() {
    this.items = new Map();
  }

  getItem(key) {
    return this.items.has(key) ? this.items.get(key) : null;
  }

  setItem(key, value) {
    this.items.set(key, String(value));
  }

  removeItem(key) {
    this.items.delete(key);
  }

  get length() {
    return this.items.size;
  }
}

// Sustituye globalThis.sessionStorage. `storage` puede ser cualquier objeto,
// o una función que se ejecuta en cada acceso (para simular que está bloqueado).
function installStorage(storage) {
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    get: typeof storage === 'function' ? storage : () => storage,
  });
}

module.exports = { FakeStorage, installStorage };
