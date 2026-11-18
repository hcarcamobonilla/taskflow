// Pruebas del tablero Kanban en el modo invitado.
// Ejecutan el módulo REAL del navegador (public/js/store/sessionStore.js, que reexporta
// sessionKanban.js) en Node, sustituyendo sessionStorage por uno de mentira.
// No usan red ni base de datos.

const { describe, test, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { FakeStorage, installStorage } = require('./helpers/fakeStorage');

let store;
let rules;
let storage;

before(async () => {
  store = await import('../public/js/store/sessionStore.js');
  rules = await import('../public/js/store/kanbanRules.js');
});

beforeEach(() => {
  storage = new FakeStorage();
  installStorage(storage);
});

async function assertRejects(promise, status, check = () => {}) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.name, 'StoreError');
    assert.equal(error.status, status);
    check(error);
    return true;
  });
}

// Resumen legible del tablero: { 'Por hacer': ['A', 'B'], 'Hecho': [] }
async function summary() {
  const board = await store.getBoard();
  return Object.fromEntries(board.columns.map((column) => [column.name, column.cards.map((card) => card.title)]));
}

async function seedBoard() {
  const todo = await store.createColumn({ name: 'Por hacer' });
  const doing = await store.createColumn({ name: 'En curso' });
  const cards = {};
  for (const title of ['A', 'B', 'C']) cards[title] = await store.createCard(todo.id, { title });
  cards.X = await store.createCard(doing.id, { title: 'X' });
  return { todo, doing, cards };
}

describe('tablero y columnas', () => {
  test('el tablero empieza vacío y sin escribir nada en sessionStorage', async () => {
    assert.deepEqual(await store.getBoard(), { project: { name: '', description: '' }, columns: [] });
    assert.equal(storage.length, 0);
  });

  test('createColumn devuelve la columna con id, posición y fechas, y la guarda', async () => {
    await store.createColumn({ name: 'Primera' });
    const column = await store.createColumn({ name: '  Segunda  ' });
    assert.equal(typeof column.id, 'string');
    assert.deepEqual([column.name, column.position], ['Segunda', 1]);
    assert.equal(column.createdAt, column.updatedAt);
    assert.equal('cards' in column, false);

    const saved = JSON.parse(storage.getItem(store.KANBAN_KEY));
    assert.deepEqual(saved.columns.map((c) => c.name), ['Primera', 'Segunda']);
  });

  test('getBoard devuelve cada tarjeta con columnId y position calculados', async () => {
    const { todo, cards } = await seedBoard();
    const board = await store.getBoard();
    const cardB = board.columns[0].cards[1];
    assert.deepEqual([cardB.id, cardB.columnId, cardB.position, cardB.title], [cards.B.id, todo.id, 1, 'B']);
    assert.deepEqual(board.columns.map((c) => c.position), [0, 1]);
  });

  test('createColumn valida los datos y respeta el tope de columnas', async () => {
    await assertRejects(store.createColumn({ name: '' }), 400, (error) => {
      assert.deepEqual(error.details.map((d) => d.field), ['name']);
    });
    await assertRejects(store.createColumn({ name: 'A', position: -1 }), 400);
    for (let i = 1; i <= rules.MAX_COLUMNS; i += 1) await store.createColumn({ name: `Columna ${i}` });
    await assertRejects(store.createColumn({ name: 'Una más' }), 409);
    assert.equal((await store.getBoard()).columns.length, rules.MAX_COLUMNS);
  });

  test('createColumn con position inserta la columna en ese lugar', async () => {
    await store.createColumn({ name: 'A' });
    await store.createColumn({ name: 'B' });
    const middle = await store.createColumn({ name: 'Nueva', position: 1 });
    assert.equal(middle.position, 1);
    const last = await store.createColumn({ name: 'Última', position: 99 });
    assert.equal(last.position, 3);
    assert.deepEqual((await store.getBoard()).columns.map((c) => c.name), ['A', 'Nueva', 'B', 'Última']);
  });

  test('duplicateColumn copia la columna con sus tarjetas a su derecha, con ids nuevos', async () => {
    const { todo, cards } = await seedBoard();
    const copy = await store.duplicateColumn(todo.id);
    assert.deepEqual([copy.name, copy.position], ['Por hacer (copia)', 1]);
    assert.notEqual(copy.id, todo.id);
    assert.deepEqual(copy.cards.map((c) => [c.title, c.position, c.columnId]), [['A', 0, copy.id], ['B', 1, copy.id], ['C', 2, copy.id]]);
    assert.equal(copy.cards.some((c) => c.id === cards.A.id), false);

    assert.deepEqual((await store.getBoard()).columns.map((c) => c.name), ['Por hacer', 'Por hacer (copia)', 'En curso']);
    await assertRejects(store.duplicateColumn('no-existe'), 404);
    for (let i = 4; i <= rules.MAX_COLUMNS; i += 1) await store.createColumn({ name: `Columna ${i}` }); // ya hay 3
    await assertRejects(store.duplicateColumn(todo.id), 409);
  });

  test('updateProject guarda título y descripción sin tocar las columnas; las demás operaciones los conservan', async () => {
    const { todo } = await seedBoard();
    assert.deepEqual(await store.updateProject({ name: '  Mi app ', description: 'Breve' }), { name: 'Mi app', description: 'Breve' });
    await store.createColumn({ name: 'Otra' });
    await store.moveColumn(todo.id, 2);
    await store.clearColumn(todo.id);
    const board = await store.getBoard();
    assert.deepEqual(board.project, { name: 'Mi app', description: 'Breve' });
    assert.equal(board.columns.length, 3);

    await assertRejects(store.updateProject({ name: 'x'.repeat(101) }), 400);
    assert.deepEqual(await store.updateProject({}), { name: '', description: '' });
  });

  test('datos guardados antes de que existiera el proyecto se leen con el proyecto vacío', async () => {
    storage.setItem(store.KANBAN_KEY, JSON.stringify({ columns: [{ id: 'a', name: 'A', cards: [] }] }));
    const board = await store.getBoard();
    assert.deepEqual(board.project, { name: '', description: '' });
    assert.equal(board.columns[0].name, 'A');
  });

  test('updateColumn cambia el nombre; moveColumn reordena', async () => {
    const { todo, doing } = await seedBoard();
    const updated = await store.updateColumn(doing.id, { name: 'Haciendo' });
    assert.deepEqual([updated.name, updated.position], ['Haciendo', 1]);

    const board = await store.moveColumn(doing.id, 0);
    assert.deepEqual(board.columns.map((c) => c.name), ['Haciendo', 'Por hacer']);
    assert.deepEqual((await store.moveColumn(doing.id, 99)).columns.map((c) => c.name), ['Por hacer', 'Haciendo']);

    await assertRejects(store.moveColumn(todo.id, -1), 400);
    await assertRejects(store.moveColumn('no-existe', 0), 404);
    await assertRejects(store.updateColumn('no-existe', { name: 'X' }), 404);
  });

  test('deleteColumn elimina la columna con sus tarjetas; clearColumn solo las tarjetas', async () => {
    const { todo, doing } = await seedBoard();
    assert.equal(await store.clearColumn(todo.id), null);
    assert.deepEqual(await summary(), { 'Por hacer': [], 'En curso': ['X'] });

    assert.equal(await store.deleteColumn(doing.id), null);
    assert.deepEqual(await summary(), { 'Por hacer': [] });
    await assertRejects(store.deleteColumn(doing.id), 404);
    await assertRejects(store.clearColumn(doing.id), 404);
  });

  test('moveAllCards pasa todas las tarjetas al final de otra columna', async () => {
    const { todo, doing } = await seedBoard();
    const board = await store.moveAllCards(todo.id, doing.id);
    assert.deepEqual(board.columns.map((c) => c.cards.map((card) => card.title)), [[], ['X', 'A', 'B', 'C']]);

    await assertRejects(store.moveAllCards(todo.id, todo.id), 400);
    await assertRejects(store.moveAllCards(todo.id, undefined), 400);
    await assertRejects(store.moveAllCards(todo.id, 'no-existe'), 404);
  });
});

describe('tarjetas', () => {
  test('createCard aplica valores por defecto y respeta el tope por columna', async () => {
    const column = await store.createColumn({ name: 'A' });
    const card = await store.createCard(column.id, { title: '  Tarjeta  ' });
    assert.deepEqual(
      [card.title, card.description, card.priority, card.dueDate, card.position, card.columnId],
      ['Tarjeta', null, 'medium', null, 0, column.id]
    );

    await assertRejects(store.createCard(column.id, { title: '' }), 400);
    await assertRejects(store.createCard('no-existe', { title: 'X' }), 404);

    for (let i = 2; i <= rules.MAX_CARDS_PER_COLUMN; i += 1) await store.createCard(column.id, { title: `T${i}` });
    await assertRejects(store.createCard(column.id, { title: 'Una más' }), 409);
  });

  test('updateCard edita sin mover; deleteCard elimina', async () => {
    const { todo, cards } = await seedBoard();
    const updated = await store.updateCard(cards.B.id, { title: 'B editada', priority: 'high', dueDate: '2026-12-01' });
    assert.deepEqual(
      [updated.title, updated.priority, updated.dueDate, updated.position, updated.columnId],
      ['B editada', 'high', '2026-12-01', 1, todo.id]
    );
    assert.equal(updated.createdAt, cards.B.createdAt);

    assert.equal(await store.deleteCard(cards.A.id), null);
    assert.deepEqual((await summary())['Por hacer'], ['B editada', 'C']);
    await assertRejects(store.deleteCard(cards.A.id), 404);
    await assertRejects(store.updateCard('no-existe', { title: 'X' }), 404);
  });

  test('moveCard reordena dentro de la columna y mueve entre columnas', async () => {
    const { todo, doing, cards } = await seedBoard();

    await store.moveCard(cards.C.id, todo.id, 0);
    assert.deepEqual((await summary())['Por hacer'], ['C', 'A', 'B']);

    const moved = await store.moveCard(cards.A.id, doing.id, 0);
    assert.deepEqual([moved.columnId, moved.position], [doing.id, 0]);
    assert.deepEqual(await summary(), { 'Por hacer': ['C', 'B'], 'En curso': ['A', 'X'] });

    await store.moveCard(cards.C.id, doing.id);
    assert.deepEqual(await summary(), { 'Por hacer': ['B'], 'En curso': ['A', 'X', 'C'] });
  });

  test('moveCard rechaza destinos y posiciones no válidos sin cambiar nada', async () => {
    const { todo, cards } = await seedBoard();
    await assertRejects(store.moveCard(cards.A.id, undefined), 400);
    await assertRejects(store.moveCard(cards.A.id, todo.id, -1), 400);
    await assertRejects(store.moveCard(cards.A.id, 'no-existe'), 404);
    await assertRejects(store.moveCard('no-existe', todo.id), 404);
    assert.deepEqual(await summary(), { 'Por hacer': ['A', 'B', 'C'], 'En curso': ['X'] });
  });
});

describe('datos del invitado', () => {
  test('clearAll borra las tareas y el tablero, y nada más', async () => {
    storage.setItem('otra.aplicacion', 'no tocar');
    await store.createTask({ title: 'Tarea' });
    await seedBoard();

    await store.clearAll();
    assert.equal(storage.getItem(store.TASKS_KEY), null);
    assert.equal(storage.getItem(store.KANBAN_KEY), null);
    assert.equal(storage.getItem('otra.aplicacion'), 'no tocar');
  });

  test('las tareas de la lista y las tarjetas del tablero son independientes', async () => {
    await store.createTask({ title: 'Solo en la lista' });
    await seedBoard();
    assert.deepEqual((await store.listTasks()).data.map((task) => task.title), ['Solo en la lista']);
    assert.equal(JSON.stringify(await store.getBoard()).includes('Solo en la lista'), false);
  });

  test('un tablero dañado produce un error claro y clearAll permite recuperarse', async () => {
    for (const raw of ['{no es json', '[]', '{"columns":[{"id":1}]}', '{"columns":[{"id":"a","name":"A","cards":[{}]}]}']) {
      storage.setItem(store.KANBAN_KEY, raw);
      await assertRejects(store.getBoard(), 0, (error) => assert.match(error.message, /dañados/));
    }
    await store.clearAll();
    assert.deepEqual(await store.getBoard(), { project: { name: '', description: '' }, columns: [] });
  });

  test('con sessionStorage bloqueado, las operaciones fallan con un mensaje claro', async () => {
    installStorage(() => {
      throw new Error('SecurityError');
    });
    await assertRejects(store.getBoard(), 0, (error) => assert.match(error.message, /no permite guardar/));
    await assertRejects(store.createColumn({ name: 'A' }), 0);
  });
});

describe('exportación', () => {
  test('toExport conserva el orden y solo incluye lo que escribió el usuario', async () => {
    const { cards } = await seedBoard();
    await store.updateCard(cards.A.id, { title: 'A', description: 'Detalle', priority: 'high', dueDate: '2026-12-01' });

    await store.updateProject({ name: 'Mi app', description: 'Breve' });
    const exported = rules.toExport(await store.getBoard(), '2026-11-16T10:00:00.000Z');
    assert.deepEqual(exported, {
      app: 'TaskFlow',
      type: 'kanban-board',
      version: 2,
      exportedAt: '2026-11-16T10:00:00.000Z',
      project: { name: 'Mi app', description: 'Breve' },
      columns: [
        {
          name: 'Por hacer',
          cards: [
            { title: 'A', description: 'Detalle', priority: 'high', dueDate: '2026-12-01' },
            { title: 'B', description: null, priority: 'medium', dueDate: null },
            { title: 'C', description: null, priority: 'medium', dueDate: null },
          ],
        },
        { name: 'En curso', cards: [{ title: 'X', description: null, priority: 'medium', dueDate: null }] },
      ],
    });
    assert.doesNotMatch(JSON.stringify(exported), /"id"|columnId|createdAt/);
  });
});
