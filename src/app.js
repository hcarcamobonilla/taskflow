// Crea y configura la aplicación Express.
// Se exporta sin llamar a listen() para que las pruebas (supertest) puedan usarla directamente.

const path = require('node:path');
const express = require('express');
const tasksRouter = require('./routes/tasks.routes');
const { apiNotFound, errorHandler } = require('./middleware/errorHandler');

function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  // Frontend estático (HTML, CSS y JavaScript del navegador).
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });
  app.use('/api/tasks', tasksRouter);

  app.use('/api', apiNotFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
