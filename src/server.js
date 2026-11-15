// Punto de entrada: arranca el servidor HTTP y lo cierra de forma ordenada.

const { createApp } = require('./app');
const config = require('./config');
const pool = require('./db/pool');

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`TaskFlow escuchando en http://localhost:${config.port}`);
});

// Un error en una conexión inactiva del pool no debe tumbar el proceso.
pool.on('error', (err) => {
  console.error('Error en una conexión inactiva de PostgreSQL:', err.message);
});

function shutdown() {
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
