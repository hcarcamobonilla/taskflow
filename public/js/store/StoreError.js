// Error común a los dos adaptadores de almacenamiento.
// La interfaz solo necesita conocer esta clase, no de dónde vienen los datos.

export class StoreError extends Error {
  constructor(message, status = 0, details = []) {
    super(message);
    this.name = 'StoreError';
    this.status = status;   // 400 validación, 404 no encontrada, 0 sin conexión o sin almacenamiento
    this.details = details; // [{ field, message }] cuando falla la validación
  }
}
