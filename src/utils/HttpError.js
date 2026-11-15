// Error con código HTTP. Lo lanzan validadores y controladores
// y lo traduce a respuesta JSON el manejador central de errores.

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}

module.exports = HttpError;
