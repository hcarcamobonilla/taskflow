// Utilidades para las pruebas de integración contra la base de datos de pruebas.

const pool = require('../../src/db/pool');
const config = require('../../src/config');

// Las funciones de vaciado se niegan a ejecutarse fuera de la base de pruebas.
function assertTestDatabase() {
  if (config.env !== 'test' || config.database !== process.env.PGDATABASE_TEST) {
    throw new Error('Las tablas solo pueden vaciarse en la base de datos de pruebas');
  }
}

// Vacía la tabla de tareas y reinicia los ids.
async function resetTasks() {
  assertTestDatabase();
  await pool.query('TRUNCATE TABLE tasks RESTART IDENTITY');
}

// Vacía el tablero Kanban (columnas, tarjetas y datos del proyecto) y reinicia los ids.
async function resetKanban() {
  assertTestDatabase();
  await pool.query('TRUNCATE TABLE kanban_cards, kanban_columns RESTART IDENTITY');
  await pool.query('DELETE FROM kanban_project');
}

module.exports = { pool, resetTasks, resetKanban };
