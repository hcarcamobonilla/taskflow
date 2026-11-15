// Pruebas de integración REALES: peticiones HTTP (supertest) contra la app Express,
// que a su vez consulta PostgreSQL (base taskflow_test). No hay nada simulado.

const { describe, test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { pool, resetTasks } = require('./helpers/db');

const app = createApp();

async function createTask(overrides = {}) {
  const res = await request(app).post('/api/tasks').send({ title: 'Tarea de prueba', ...overrides });
  assert.equal(res.status, 201);
  return res.body.data;
}

beforeEach(resetTasks);
after(() => pool.end());

describe('POST /api/tasks', () => {
  test('crea la tarea, devuelve 201 y queda guardada en PostgreSQL', async () => {
    const res = await request(app).post('/api/tasks').send({
      title: 'Preparar entrevista',
      description: 'Repasar la guía técnica',
      priority: 'high',
      dueDate: '2026-12-01',
    });

    assert.equal(res.status, 201);
    assert.equal(res.headers.location, `/api/tasks/${res.body.data.id}`);
    assert.equal(res.body.data.title, 'Preparar entrevista');
    assert.equal(res.body.data.status, 'pending');
    assert.equal(res.body.data.dueDate, '2026-12-01');
    assert.ok(res.body.data.createdAt);

    // Comprobación directa en la base de datos, sin pasar por la API.
    const { rows } = await pool.query('SELECT title, priority FROM tasks WHERE id = $1', [res.body.data.id]);
    assert.deepEqual(rows, [{ title: 'Preparar entrevista', priority: 'high' }]);
  });

  test('rechaza título vacío con 400 y no inserta nada', async () => {
    const res = await request(app).post('/api/tasks').send({ title: '   ' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.details[0].field, 'title');

    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM tasks');
    assert.equal(rows[0].n, 0);
  });

  test('rechaza fecha inválida, estado y prioridad desconocidos', async () => {
    const res = await request(app).post('/api/tasks').send({
      title: 'A', dueDate: '2026-02-30', status: 'done', priority: 'urgent',
    });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body.error.details.map((d) => d.field).sort(), ['dueDate', 'priority', 'status']);
  });

  test('rechaza JSON malformado con 400', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Content-Type', 'application/json')
      .send('{"title": "sin cerrar"');
    assert.equal(res.status, 400);
    assert.match(res.body.error.message, /JSON/);
  });

  test('guarda como texto literal un intento de inyección SQL', async () => {
    const title = "x'); DROP TABLE tasks; --";
    const created = await createTask({ title });
    const res = await request(app).get(`/api/tasks/${created.id}`);
    assert.equal(res.body.data.title, title);
  });
});

describe('GET /api/tasks/:id', () => {
  test('devuelve la tarea existente', async () => {
    const created = await createTask();
    const res = await request(app).get(`/api/tasks/${created.id}`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, created);
  });

  test('devuelve 404 si el id no existe', async () => {
    const res = await request(app).get('/api/tasks/99999');
    assert.equal(res.status, 404);
    assert.equal(res.body.error.message, 'Tarea no encontrada');
  });

  test('devuelve 400 si el id no es un entero positivo', async () => {
    for (const id of ['abc', '-1', '1.5', '99999999999']) {
      const res = await request(app).get(`/api/tasks/${id}`);
      assert.equal(res.status, 400, `id ${id}`);
    }
  });
});

describe('PUT /api/tasks/:id', () => {
  test('actualiza todos los campos y renueva updatedAt', async () => {
    const created = await createTask({ description: 'antes', dueDate: '2026-12-01' });
    const res = await request(app).put(`/api/tasks/${created.id}`).send({
      title: 'Título editado', status: 'in_progress', priority: 'low',
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.title, 'Título editado');
    assert.equal(res.body.data.status, 'in_progress');
    assert.equal(res.body.data.priority, 'low');
    assert.equal(res.body.data.description, null);
    assert.equal(res.body.data.dueDate, null);
    assert.equal(res.body.data.createdAt, created.createdAt);
    assert.ok(new Date(res.body.data.updatedAt) > new Date(created.updatedAt));
  });

  test('devuelve 404 si no existe y 400 si los datos no son válidos', async () => {
    const missing = await request(app).put('/api/tasks/99999').send({ title: 'A' });
    assert.equal(missing.status, 404);

    const created = await createTask();
    const invalid = await request(app).put(`/api/tasks/${created.id}`).send({ title: '' });
    assert.equal(invalid.status, 400);
  });
});

describe('PATCH /api/tasks/:id/status', () => {
  test('cambia solo el estado', async () => {
    const created = await createTask({ priority: 'high' });
    const res = await request(app).patch(`/api/tasks/${created.id}/status`).send({ status: 'completed' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'completed');
    assert.equal(res.body.data.priority, 'high');
    assert.equal(res.body.data.title, created.title);
  });

  test('rechaza estados inválidos (400) e ids inexistentes (404)', async () => {
    const created = await createTask();
    const invalid = await request(app).patch(`/api/tasks/${created.id}/status`).send({ status: 'archived' });
    assert.equal(invalid.status, 400);

    const missing = await request(app).patch('/api/tasks/99999/status').send({ status: 'completed' });
    assert.equal(missing.status, 404);
  });
});

describe('DELETE /api/tasks/:id', () => {
  test('elimina la tarea (204) y después ya no existe (404)', async () => {
    const created = await createTask();
    const res = await request(app).delete(`/api/tasks/${created.id}`);
    assert.equal(res.status, 204);

    assert.equal((await request(app).get(`/api/tasks/${created.id}`)).status, 404);
    assert.equal((await request(app).delete(`/api/tasks/${created.id}`)).status, 404);
  });
});

describe('GET /api/tasks', () => {
  async function seedList() {
    await createTask({ title: 'Alfa informe', status: 'pending', priority: 'low', dueDate: '2026-12-10' });
    await createTask({ title: 'Beta', description: 'Enviar INFORME mensual', status: 'in_progress', priority: 'high', dueDate: '2026-12-01' });
    await createTask({ title: 'Gamma 100% listo', status: 'completed', priority: 'medium' });
    await createTask({ title: 'Delta', status: 'pending', priority: 'high', dueDate: '2026-12-05' });
  }

  const titles = (res) => res.body.data.map((task) => task.title);

  test('lista vacía: 200 con recuentos en cero', async () => {
    const res = await request(app).get('/api/tasks');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      data: [],
      meta: { total: 0, countsByStatus: { pending: 0, in_progress: 0, completed: 0 } },
    });
  });

  test('por defecto ordena de más reciente a más antigua e incluye recuentos', async () => {
    await seedList();
    const res = await request(app).get('/api/tasks');
    assert.deepEqual(titles(res), ['Delta', 'Gamma 100% listo', 'Beta', 'Alfa informe']);
    assert.deepEqual(res.body.meta, {
      total: 4,
      countsByStatus: { pending: 2, in_progress: 1, completed: 1 },
    });
  });

  test('filtra por estado y por prioridad (y por ambos)', async () => {
    await seedList();
    assert.deepEqual(titles(await request(app).get('/api/tasks?status=pending')), ['Delta', 'Alfa informe']);
    assert.deepEqual(titles(await request(app).get('/api/tasks?priority=high')), ['Delta', 'Beta']);
    assert.deepEqual(titles(await request(app).get('/api/tasks?status=pending&priority=high')), ['Delta']);
  });

  test('los recuentos del dashboard son globales aunque haya filtros', async () => {
    await seedList();
    const res = await request(app).get('/api/tasks?status=completed');
    assert.equal(res.body.meta.total, 1);
    assert.deepEqual(res.body.meta.countsByStatus, { pending: 2, in_progress: 1, completed: 1 });
  });

  test('busca texto en título y descripción sin distinguir mayúsculas', async () => {
    await seedList();
    assert.deepEqual(titles(await request(app).get('/api/tasks?q=informe')), ['Beta', 'Alfa informe']);
  });

  test('trata % y _ de la búsqueda como texto literal', async () => {
    await seedList();
    assert.deepEqual(titles(await request(app).get('/api/tasks?q=' + encodeURIComponent('100%'))), ['Gamma 100% listo']);
    assert.deepEqual(titles(await request(app).get('/api/tasks?q=' + encodeURIComponent('%'))), ['Gamma 100% listo']);
    assert.deepEqual(titles(await request(app).get('/api/tasks?q=_')), []);
  });

  test('ordena por fecha límite dejando al final las tareas sin fecha', async () => {
    await seedList();
    assert.deepEqual(
      titles(await request(app).get('/api/tasks?sort=due_date&order=asc')),
      ['Beta', 'Delta', 'Alfa informe', 'Gamma 100% listo']
    );
    assert.deepEqual(
      titles(await request(app).get('/api/tasks?sort=due_date&order=desc')),
      ['Alfa informe', 'Delta', 'Beta', 'Gamma 100% listo']
    );
  });

  test('ordena por prioridad (high > medium > low)', async () => {
    await seedList();
    assert.deepEqual(
      titles(await request(app).get('/api/tasks?sort=priority&order=desc')),
      ['Delta', 'Beta', 'Gamma 100% listo', 'Alfa informe']
    );
    assert.deepEqual(
      titles(await request(app).get('/api/tasks?sort=priority&order=asc')).at(0),
      'Alfa informe'
    );
  });

  test('rechaza filtros y órdenes no permitidos con 400', async () => {
    for (const query of ['status=done', 'priority=urgent', 'sort=title', 'order=up']) {
      const res = await request(app).get(`/api/tasks?${query}`);
      assert.equal(res.status, 400, query);
    }
  });
});

describe('Rutas inexistentes', () => {
  test('una ruta /api desconocida devuelve 404 en JSON', async () => {
    const res = await request(app).get('/api/no-existe');
    assert.equal(res.status, 404);
    assert.equal(res.body.error.message, 'Recurso no encontrado');
  });
});
