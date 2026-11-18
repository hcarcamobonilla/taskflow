// Paridad entre las dos versiones: las mismas operaciones se ejecutan contra
//   - la API real (supertest -> Express -> PostgreSQL, base taskflow_test), y
//   - el adaptador de sessionStorage del navegador (con un sessionStorage de mentira),
// y los resultados deben coincidir. Si alguien cambia una regla en un solo lado, esto falla.

const { describe, test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { pool, resetTasks, resetKanban } = require('./helpers/db');
const { FakeStorage, installStorage } = require('./helpers/fakeStorage');

const app = createApp();
let sessionStore;

before(async () => {
  sessionStore = await import('../public/js/store/sessionStore.js');
});

beforeEach(async () => {
  await resetTasks();
  await resetKanban();
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

/* ---------- Tablero Kanban ---------- */

// Resultado comparable de una operación del tablero. Aquí también se compara el mensaje,
// porque los errores 404 y 409 no llevan detalle por campo.
const kanbanFailure = (status, message, details) => ({ error: { status, message, details: details || [] } });

// Las dos versiones del tablero con la misma forma: cada función devuelve los datos o el error.
const kanbanApi = (() => {
  const send = async (method, path, body) => {
    const res = await request(app)[method](`/api/kanban${path}`).send(body);
    if (res.status === 204) return null;
    return res.status < 300
      ? res.body.data
      : kanbanFailure(res.status, res.body.error.message, res.body.error.details);
  };
  return {
    missingId: 999999,
    getBoard: () => send('get', ''),
    updateProject: (body) => send('put', '/project', body),
    setCardCompleted: (id, completed) => send('patch', `/cards/${id}/completed`, { completed }),
    duplicateCard: (id) => send('post', `/cards/${id}/duplicate`),
    createColumn: (body) => send('post', '/columns', body),
    duplicateColumn: (id) => send('post', `/columns/${id}/duplicate`),
    updateColumn: (id, body) => send('put', `/columns/${id}`, body),
    moveColumn: (id, position) => send('patch', `/columns/${id}/move`, { position }),
    deleteColumn: (id) => send('delete', `/columns/${id}`),
    clearColumn: (id) => send('delete', `/columns/${id}/cards`),
    moveAllCards: (id, targetColumnId) => send('post', `/columns/${id}/move-cards`, { targetColumnId }),
    createCard: (columnId, body) => send('post', `/columns/${columnId}/cards`, body),
    updateCard: (id, body) => send('put', `/cards/${id}`, body),
    moveCard: (id, columnId, position) => send('patch', `/cards/${id}/move`, { columnId, position }),
    deleteCard: (id) => send('delete', `/cards/${id}`),
  };
})();

const kanbanBrowser = (() => {
  const call = (name) => async (...args) => {
    try {
      return await sessionStore[name](...args);
    } catch (error) {
      return kanbanFailure(error.status, error.message, error.details);
    }
  };
  const names = ['getBoard', 'updateProject', 'createColumn', 'duplicateColumn', 'setCardCompleted', 'duplicateCard', 'updateColumn', 'moveColumn', 'deleteColumn', 'clearColumn',
    'moveAllCards', 'createCard', 'updateCard', 'moveCard', 'deleteCard'];
  return { missingId: 'no-existe', ...Object.fromEntries(names.map((name) => [name, call(name)])) };
})();

// Quita lo que es propio de cada almacenamiento (ids y fechas), también en datos anidados.
function comparableKanban(value) {
  if (Array.isArray(value)) return value.map(comparableKanban);
  if (value === null || typeof value !== 'object') return value;
  const { id, columnId, createdAt, updatedAt, ...rest } = value;
  return Object.fromEntries(Object.entries(rest).map(([key, item]) => [key, comparableKanban(item)]));
}

// En los pasos, las columnas y tarjetas se nombran por su nombre o título; cada versión
// recuerda qué id le dio a cada una. MISSING representa un id que no existe.
const MISSING = Symbol('id inexistente');
const col = (name) => ({ ref: 'columns', name });
const card = (title) => ({ ref: 'cards', name: title });

async function runStep(side, known, [operation, ...args]) {
  const resolved = args.map((arg) => {
    if (arg === MISSING) return side.missingId;
    if (arg && arg.ref) return known[arg.ref][arg.name];
    return arg;
  });
  const result = await side[operation](...resolved);
  if (result && !result.error) {
    if (operation === 'createColumn' || operation === 'duplicateColumn') known.columns[result.name] = result.id;
    if (operation === 'createCard') known.cards[result.title] = result.id;
  }
  return result;
}

// Ejecuta los mismos pasos en las dos versiones y compara cada resultado y el tablero final.
async function assertSameKanban(steps) {
  const knownApi = { columns: {}, cards: {} };
  const knownBrowser = { columns: {}, cards: {} };

  for (const step of steps) {
    const fromApi = await runStep(kanbanApi, knownApi, step);
    const fromBrowser = await runStep(kanbanBrowser, knownBrowser, step);
    const label = JSON.stringify(step, (key, value) => (value === MISSING ? '<inexistente>' : value)).slice(0, 90);
    assert.deepEqual(comparableKanban(fromBrowser), comparableKanban(fromApi), label);
  }

  const boardApi = await kanbanApi.getBoard();
  const boardBrowser = await kanbanBrowser.getBoard();
  assert.deepEqual(comparableKanban(boardBrowser), comparableKanban(boardApi), 'tablero final');
  return boardApi;
}

const BASE_BOARD = [
  ['createColumn', { name: 'Por hacer' }],
  ['createColumn', { name: '  En curso  ' }],
  ['createColumn', { name: 'Hecho' }],
  ['createCard', col('Por hacer'), { title: 'A' }],
  ['createCard', col('Por hacer'), { title: '  B  ', description: '  detalle  ', priority: 'high', dueDate: '2028-02-29' }],
  ['createCard', col('Por hacer'), { title: 'C', description: '   ', dueDate: '' }],
  ['createCard', col('En curso'), { title: 'X', priority: 'low' }],
];

describe('Paridad del tablero Kanban: API (PostgreSQL) / sessionStorage', () => {
  test('crear columnas y tarjetas produce el mismo tablero', async () => {
    const board = await assertSameKanban(BASE_BOARD);
    assert.deepEqual(board.columns.map((column) => column.cards.length), [3, 1, 0]);
  });

  test('las mismas entradas no válidas producen el mismo error y los mismos mensajes', async () => {
    await assertSameKanban([
      ...BASE_BOARD,
      ['createColumn', {}],
      ['createColumn', { name: '   ' }],
      ['createColumn', { name: 7 }],
      ['createColumn', { name: 'x'.repeat(61) }],
      ['createColumn', { name: 'A', position: -1 }],
      ['createColumn', { name: 'A', position: 1.5 }],
      ['createColumn', { name: 'A', position: '1' }],
      ['createColumn', { name: '', position: -1 }],
      ['updateProject', { name: 'x'.repeat(101) }],
      ['updateProject', { description: 'y'.repeat(301) }],
      ['updateProject', { name: 7, description: false }],
      ['updateProject', []],
      ['setCardCompleted', card('A'), 'true'],
      ['setCardCompleted', card('A'), 1],
      ['setCardCompleted', card('A'), null],
      ['updateColumn', col('Hecho'), { name: '' }],
      ['createCard', col('Hecho'), {}],
      ['createCard', col('Hecho'), { title: 'x'.repeat(151) }],
      ['createCard', col('Hecho'), { title: 'T', description: 42 }],
      ['createCard', col('Hecho'), { title: 'T', description: 'x'.repeat(2001) }],
      ['createCard', col('Hecho'), { title: 'T', priority: 'urgent' }],
      ['createCard', col('Hecho'), { title: 'T', dueDate: '2026-02-30' }],
      ['createCard', col('Hecho'), { title: '', priority: 'x', dueDate: 'y' }],
      ['updateCard', card('A'), { title: '   ' }],
      ['moveColumn', col('Hecho'), -1],
      ['moveColumn', col('Hecho'), 1.5],
      ['moveColumn', col('Hecho'), undefined],
      ['moveCard', card('A'), undefined],
      ['moveCard', card('A'), col('Hecho'), -1],
      ['moveCard', card('A'), col('Hecho'), 'primera'],
      ['moveAllCards', col('Por hacer'), undefined],
      ['moveAllCards', col('Por hacer'), col('Por hacer')],
    ]);
  });

  test('las operaciones sobre columnas o tarjetas inexistentes producen el mismo 404', async () => {
    await assertSameKanban([
      ...BASE_BOARD,
      ['updateColumn', MISSING, { name: 'X' }],
      ['moveColumn', MISSING, 0],
      ['deleteColumn', MISSING],
      ['clearColumn', MISSING],
      ['duplicateColumn', MISSING],
      ['setCardCompleted', MISSING, true],
      ['duplicateCard', MISSING],
      ['moveAllCards', MISSING, col('Hecho')],
      ['moveAllCards', col('Por hacer'), MISSING],
      ['createCard', MISSING, { title: 'X' }],
      ['updateCard', MISSING, { title: 'X' }],
      ['moveCard', MISSING, col('Hecho')],
      ['moveCard', card('A'), MISSING],
      ['deleteCard', MISSING],
    ]);
  });

  test('editar, mover y reordenar dejan el mismo tablero en las dos versiones', async () => {
    const board = await assertSameKanban([
      ...BASE_BOARD,
      ['updateColumn', col('Hecho'), { name: 'Terminado' }],
      ['updateColumn', col('En curso'), { name: 'En curso' }],
      ['updateCard', card('A'), { title: 'A editada', description: 'nueva', priority: 'low', dueDate: '2026-12-24' }],
      ['moveCard', card('C'), col('Por hacer'), 0],
      ['moveCard', card('C'), col('Por hacer'), 1],
      ['moveCard', card('A'), col('Por hacer')],
      ['moveCard', card('B'), col('Por hacer'), 0],
      ['moveCard', card('B'), col('En curso'), 0],
      ['moveCard', card('A'), col('En curso'), 99],
      ['moveCard', card('X'), col('Hecho')],
      ['moveCard', card('X'), col('Hecho'), 0],
      ['moveColumn', col('Hecho'), 0],
      ['moveColumn', col('Hecho'), 99],
      ['moveColumn', col('Por hacer'), 1],
      ['deleteCard', card('C')],
    ]);
    assert.deepEqual(
      board.columns.map((column) => [column.name, column.cards.map((item) => item.title)]),
      [['En curso', ['B', 'A editada']], ['Por hacer', []], ['Terminado', ['X']]]
    );
  });

  test('vaciar, mover todas y eliminar columnas dejan el mismo tablero', async () => {
    const board = await assertSameKanban([
      ...BASE_BOARD,
      ['moveAllCards', col('Por hacer'), col('En curso')],
      ['moveAllCards', col('Hecho'), col('Por hacer')],
      ['createCard', col('Hecho'), { title: 'Y' }],
      ['clearColumn', col('Hecho')],
      ['deleteColumn', col('Por hacer')],
      ['createColumn', { name: 'Nueva' }],
    ]);
    assert.deepEqual(
      board.columns.map((column) => [column.name, column.position, column.cards.map((item) => item.title)]),
      [['En curso', 0, ['X', 'A', 'B', 'C']], ['Hecho', 1, []], ['Nueva', 2, []]]
    );
  });

  test('crear una columna en una posición dejan el mismo orden en las dos versiones', async () => {
    const board = await assertSameKanban([
      ...BASE_BOARD,
      ['createColumn', { name: 'Entre medias', position: 1 }],
      ['createColumn', { name: 'La primera', position: 0 }],
      ['createColumn', { name: 'Al final', position: 99 }],
      ['createColumn', { name: 'Sin posición', position: null }],
    ]);
    assert.deepEqual(
      board.columns.map((column) => column.name),
      ['La primera', 'Por hacer', 'Entre medias', 'En curso', 'Hecho', 'Al final', 'Sin posición']
    );
  });

  test('duplicar una columna produce la misma copia y el mismo tablero', async () => {
    const board = await assertSameKanban([
      ...BASE_BOARD,
      ['duplicateColumn', col('Por hacer')],
      ['duplicateColumn', col('Hecho')],
      ['createColumn', { name: 'x'.repeat(60) }],
      ['duplicateColumn', col('x'.repeat(60))],
      ['moveCard', card('X'), col('Por hacer (copia)')],
      ['deleteColumn', col('Por hacer')],
    ]);
    assert.deepEqual(
      board.columns.map((column) => [column.name, column.cards.map((item) => item.title)]),
      [
        ['Por hacer (copia)', ['A', 'B', 'C', 'X']],
        ['En curso', []],
        ['Hecho', []],
        ['Hecho (copia)', []],
        ['x'.repeat(60), []],
        [`${'x'.repeat(52)} (copia)`, []], // el nombre se recorta para no pasar de 60 caracteres
      ]
    );
  });

  test('completar y duplicar tarjetas produce los mismos datos y el mismo orden', async () => {
    const board = await assertSameKanban([
      ...BASE_BOARD,
      ['setCardCompleted', card('B'), true],
      ['duplicateCard', card('B')],
      ['updateCard', card('A'), { title: 'A editada' }],
      ['setCardCompleted', card('A'), true],
      ['setCardCompleted', card('B'), false],
      ['duplicateColumn', col('Por hacer')],
    ]);
    assert.deepEqual(
      board.columns[0].cards.map((item) => [item.title, item.completed]),
      [['A editada', true], ['B', false], ['B', true], ['C', false]]
    );
    assert.deepEqual(
      board.columns[1].cards.map((item) => [item.title, item.completed]),
      [['A editada', true], ['B', false], ['B', true], ['C', false]]
    );
  });

  test('el título y la descripción del proyecto se guardan igual y no los toca ningún otro cambio', async () => {
    const board = await assertSameKanban([
      ['updateProject', { name: '  Mi proyecto ', description: ' Algo breve ' }],
      ...BASE_BOARD,
      ['moveColumn', col('Hecho'), 0],
      ['deleteColumn', col('En curso')],
      ['updateProject', { name: 'Otro título' }],
      ['updateProject', {}],
      ['updateProject', { name: 'Final', description: 'Descripción final' }],
    ]);
    assert.deepEqual(board.project, { name: 'Final', description: 'Descripción final' });
  });

  test('los topes de columnas y de tarjetas se aplican igual (409)', async () => {
    const columns = Array.from({ length: 8 }, (_, index) => ['createColumn', { name: `Columna ${index + 1}` }]);
    const cards = (columnName, count, prefix) =>
      Array.from({ length: count }, (_, index) => ['createCard', col(columnName), { title: `${prefix}${index + 1}` }]);

    await assertSameKanban([
      ...columns,
      ['createColumn', { name: 'La novena' }],
      ['createColumn', { name: 'La novena en medio', position: 1 }],
      ['duplicateColumn', col('Columna 1')],
      ...cards('Columna 1', 50, 'T'),
      ['createCard', col('Columna 1'), { title: 'La 51' }],
      ...cards('Columna 2', 1, 'U'),
      ['moveCard', card('U1'), col('Columna 1')],
      ['moveAllCards', col('Columna 2'), col('Columna 1')],
      ['moveCard', card('T50'), col('Columna 1'), 0],
    ]);
  });
});
