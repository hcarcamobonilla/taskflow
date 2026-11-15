// Utilidades para las pruebas de integración contra la base de datos de pruebas.

const pool = require('../../src/db/pool');
const config = require('../../src/config');

// Vacía la tabla y reinicia los ids. Se niega a ejecutarse fuera de la base de pruebas.
async function resetTasks() {
  if (config.env !== 'test' || config.database !== process.env.PGDATABASE_TEST) {
    throw new Error('resetTasks solo puede ejecutarse contra la base de datos de pruebas');
  }
  await pool.query('TRUNCATE TABLE tasks RESTART IDENTITY');
}

module.exports = { pool, resetTasks };
