// Ejecuta varias consultas como una sola operación: o se guardan todas o ninguna.
//
// Hace falta cuando un cambio toca varias filas (por ejemplo, mover una tarjeta obliga a
// renumerar las demás). Si algo falla a mitad de camino, ROLLBACK deja la base como estaba.
// Todas las consultas deben usar el mismo cliente: por eso se pide uno al pool y se
// entrega a la función `work`.

const pool = require('./pool');

async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    // Si la conexión se perdió, el propio ROLLBACK puede fallar: interesa el error original.
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { withTransaction };
