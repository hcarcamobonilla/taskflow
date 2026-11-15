// Pool de conexiones a PostgreSQL compartido por toda la aplicación.

const { Pool, types } = require('pg');
const config = require('../config');

// Por defecto pg convierte DATE (OID 1082) en un objeto Date de JavaScript a medianoche
// en la zona horaria local, lo que puede cambiar el día al serializarlo.
// Se conserva como texto 'YYYY-MM-DD', que es lo que espera el frontend.
types.setTypeParser(1082, (value) => value);

const pool = new Pool({
  database: config.database,
  max: 10,
  connectionTimeoutMillis: 3000,
});

module.exports = pool;
