// Crea y configura la aplicación Express.
// Se exporta sin llamar a listen() para que las pruebas (supertest) puedan usarla directamente.

const path = require('node:path');
const express = require('express');

function createApp() {
  const app = express();

  app.use(express.json({ limit: '100kb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  return app;
}

module.exports = { createApp };
