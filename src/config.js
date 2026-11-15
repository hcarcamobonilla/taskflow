// Configuración centralizada: lee las variables de entorno una sola vez.
// Las variables PG* (PGHOST, PGUSER, PGPASSWORD...) las lee directamente la biblioteca pg.

const config = {
  port: Number(process.env.PORT) || 3000,
  env: process.env.NODE_ENV || 'development',
};

config.isProduction = config.env === 'production';

module.exports = config;
