// Manejo centralizado de errores: toda respuesta de error de la API sale de aquí
// con el mismo formato: { error: { message, details? } }.

const config = require('../config');
const HttpError = require('../utils/HttpError');

// Rutas /api que no existen.
function apiNotFound(req, res, next) {
  next(new HttpError(404, 'Recurso no encontrado'));
}

// Errores de red al conectar con PostgreSQL y códigos SQLSTATE de conexión (clase 08)
// o de servidor apagándose/arrancando (57P01-57P03).
const CONNECTION_ERROR_CODES = ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', '57P01', '57P02', '57P03'];

function isDatabaseDown(err) {
  if (CONNECTION_ERROR_CODES.includes(err.code)) return true;
  if (typeof err.code === 'string' && err.code.startsWith('08')) return true;
  if (/timeout exceeded when trying to connect|Connection terminated/i.test(err.message || '')) return true;
  // Con varios intentos de conexión fallidos (IPv4/IPv6) Node agrupa los errores.
  return Array.isArray(err.errors) && err.errors.some(isDatabaseDown);
}

function toResponse(err) {
  if (err instanceof HttpError) {
    return { status: err.status, message: err.message, details: err.details };
  }
  // Errores de express.json(): JSON malformado o cuerpo demasiado grande.
  if (err.type === 'entity.parse.failed') {
    return { status: 400, message: 'El cuerpo de la petición no es JSON válido' };
  }
  if (err.type === 'entity.too.large') {
    return { status: 413, message: 'El cuerpo de la petición es demasiado grande' };
  }
  if (isDatabaseDown(err)) {
    return { status: 503, message: 'La base de datos no está disponible. Inténtalo de nuevo más tarde.' };
  }
  return { status: 500, message: 'Error interno del servidor' };
}

// Express reconoce un manejador de errores por sus cuatro parámetros.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const { status, message, details } = toResponse(err);

  // Los errores inesperados se registran en el servidor; al cliente nunca se le envían
  // trazas ni mensajes internos (podrían revelar detalles de la base de datos).
  if (status >= 500 && config.env !== 'test') {
    console.error(config.isProduction ? `${err.name}: ${err.message}` : err);
  }

  const body = { error: { message } };
  if (details) body.error.details = details;
  res.status(status).json(body);
}

module.exports = { apiNotFound, errorHandler, isDatabaseDown };
