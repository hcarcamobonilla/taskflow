// Punto de entrada: arranca el servidor HTTP.

const { createApp } = require('./app');
const config = require('./config');

const app = createApp();

app.listen(config.port, () => {
  console.log(`TaskFlow escuchando en http://localhost:${config.port}`);
});
