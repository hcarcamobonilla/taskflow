// Paridad entre las dos versiones: las mismas operaciones se ejecutan contra
//   - la API real (supertest -> Express -> PostgreSQL, base taskflow_test), y
//   - el adaptador de sessionStorage del navegador (con un sessionStorage de mentira),
// y los resultados deben coincidir. Si alguien cambia una regla en un solo lado, esto falla.

const { describe, test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { pool, resetTasks } = require('./helpers/db');
const { FakeStorage, installStorage } = require('./helpers/fakeStorage');

const app = createApp();
let sessionStore;

before(async () => {
  sessionStore = await import('../public/js/store/sessionStore.js');
});

beforeEach(async () => {
  await resetTasks();
  installStorage(new FakeStorage());
});

after(() => pool.end());

// Resultado comparable de una operación: los datos, o el error (código y detalle).
const failure = (status, details) => ({ error: { status, details: details || [] } });

const api = {
  async create(body) {
    const res = await request(app).post('/api/tasks').send(body);
    return res.status === 201 ? res.body.data : failure(res.status, res.body.error.details);
  },
  async list(filters) {
    const res = await request(app).get('/api/tasks').query(filters);
    return res.status === 200 ? res.body : failure(res.status, res.body.error.details);
  },
};

const browser = {
  async create(body) {
    try {
      return await sessionStore.createTask(body);
    } catch (error) {
      return failure(error.status, error.details);
    }
  },
  async list(filters) {
    try {
      return await sessionStore.listTasks(filters);
    } catch (error) {
      return failure(error.status, error.details);
    }
  },
};

// Los ids y las fechas de creación son propios de cada almacenamiento: no se comparan.
const comparable = ({ id, createdAt, updatedAt, ...rest }) => rest;

const SEED = [
  { title: 'Alfa informe', status: 'pending', priority: 'low', dueDate: '2026-12-10' },
  { title: 'Beta', description: 'Enviar INFORME mensual', status: 'in_progress', priority: 'high', dueDate: '2026-12-01' },
  { title: 'Gamma 100% listo', status: 'completed', priority: 'medium' },
  { title: 'Delta', status: 'pending', priority: 'high', dueDate: '2026-12-05' },
  { title: 'Épsilon', description: 'Sin fecha y prioridad alta', priority: 'high' },
  { title: 'Zeta', status: 'completed', priority: 'low', dueDate: '2026-12-05' },
];

const FILTERS = [
  {},
  { status: 'pending' },
  { status: 'completed' },
  { priority: 'high' },
  { status: 'pending', priority: 'high' },
  { q: 'informe' },
  { q: 'INFORME' },
  { q: '100%' },
  { q: '%' },
  { q: '_' },
  { q: 'no existe' },
  { q: 'a', status: 'pending' },
  { sort: 'created_at', order: 'asc' },
  { sort: 'created_at', order: 'desc' },
  { sort: 'due_date', order: 'asc' },
  { sort: 'due_date', order: 'desc' },
  { sort: 'priority', order: 'asc' },
  { sort: 'priority', order: 'desc' },
  { sort: 'priority', order: 'desc', status: 'pending', q: 'a' },
  { status: 'done' },
  { priority: 'urgent' },
  { sort: 'title' },
  { order: 'up' },
  { q: 'x'.repeat(101) },
];

const INVALID_BODIES = [
  {},
  { title: '' },
  { title: '   ' },
  { title: 123 },
  { title: 'x'.repeat(151) },
  { title: 'A', description: 'x'.repeat(2001) },
  { title: 'A', description: 42 },
  { title: 'A', status: 'done' },
  { title: 'A', priority: 'urgent' },
  { title: 'A', dueDate: '2026-02-30' },
  { title: 'A', dueDate: '31/12/2026' },
  { title: '', status: 'x', priority: 'y', dueDate: 'z' },
];

const VALID_BODIES = [
  { title: '  Con espacios  ' },
  { title: 'Completa', description: '  texto  ', status: 'in_progress', priority: 'high', dueDate: '2028-02-29' },
  { title: 'Descripción vacía', description: '   ', dueDate: '' },
  { title: 'Nulos', description: null, dueDate: null },
  { title: 'x'.repeat(150) },
];

describe('Paridad API (PostgreSQL) / sessionStorage', () => {
  test('crear: los mismos datos válidos producen la misma tarea', async () => {
    for (const body of VALID_BODIES) {
      const fromApi = await api.create(body);
      const fromBrowser = await browser.create(body);
      assert.deepEqual(comparable(fromBrowser), comparable(fromApi), JSON.stringify(body).slice(0, 60));
    }
  });

  test('crear: los mismos datos inválidos producen el mismo error y los mismos mensajes', async () => {
    for (const body of INVALID_BODIES) {
      const fromApi = await api.create(body);
      const fromBrowser = await browser.create(body);
      assert.equal(fromApi.error.status, 400);
      assert.deepEqual(fromBrowser, fromApi, JSON.stringify(body).slice(0, 60));
    }
  });

  test('listar: mismos resultados, mismo orden y mismas estadísticas con cada filtro', async () => {
    for (const body of SEED) {
      await api.create(body);
      await browser.create(body);
    }

    for (const filters of FILTERS) {
      const fromApi = await api.list(filters);
      const fromBrowser = await browser.list(filters);
      const label = JSON.stringify(filters).slice(0, 60);

      if (fromApi.error) {
        assert.deepEqual(fromBrowser, fromApi, label);
      } else {
        assert.deepEqual(fromBrowser.data.map(comparable), fromApi.data.map(comparable), label);
        assert.deepEqual(fromBrowser.meta, fromApi.meta, label);
      }
    }
  });
});
