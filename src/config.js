// Configuración centralizada: lee las variables de entorno una sola vez.
// Usuario, contraseña, host y puerto (PGUSER, PGPASSWORD, PGHOST, PGPORT) los lee
// directamente la biblioteca pg; aquí solo se decide qué base de datos usar.

const env = process.env.NODE_ENV || 'development';

const config = {
  env,
  isProduction: env === 'production',
  port: Number(process.env.PORT) || 3000,
  // Las pruebas (NODE_ENV=test) trabajan en una base separada para no tocar los datos de desarrollo.
  database: env === 'test' ? process.env.PGDATABASE_TEST : process.env.PGDATABASE,
};

module.exports = config;
