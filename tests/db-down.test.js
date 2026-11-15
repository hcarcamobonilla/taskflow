// Simula la caída de PostgreSQL apuntando el pool a un puerto donde no escucha nadie.
// node:test ejecuta cada archivo en un proceso propio, así que este cambio de entorno
// no afecta a las demás pruebas. Debe hacerse ANTES de cargar la aplicación.
process.env.PGPORT = '1';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const pool = require('../src/db/pool');

const app = createApp();
after(() => pool.end());

test('si la base de datos no responde, la API devuelve 503 sin detalles internos', async () => {
  const res = await request(app).get('/api/tasks');
  assert.equal(res.status, 503);
  assert.deepEqual(Object.keys(res.body), ['error']);
  assert.deepEqual(Object.keys(res.body.error), ['message']);
  assert.doesNotMatch(JSON.stringify(res.body), /ECONNREFUSED|127\.0\.0\.1|stack|at /);
});

test('las escrituras también responden 503 con la base caída', async () => {
  const res = await request(app).post('/api/tasks').send({ title: 'No se guardará' });
  assert.equal(res.status, 503);
});

test('el endpoint de salud y la validación siguen funcionando sin base de datos', async () => {
  assert.equal((await request(app).get('/api/health')).status, 200);
  assert.equal((await request(app).post('/api/tasks').send({ title: '' })).status, 400);
});
