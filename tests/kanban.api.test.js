// Pruebas de integración reales del tablero Kanban: supertest -> Express -> PostgreSQL
// (base taskflow_test, que se vacía antes de cada prueba).

const { describe, test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { pool, resetKanban } = require('./helpers/db');
const { MAX_COLUMNS, MAX_CARDS_PER_COLUMN } = require('../src/validators/kanban.validator');

const app = createApp();

beforeEach(resetKanban);
after(() => pool.end());

/* ---------- Ayudas ---------- */

async function addColumn(name, position) {
  const res = await request(app).post('/api/kanban/columns').send({ name, position });
  assert.equal(res.status, 201);
  return res.body.data;
}

async function addCard(columnId, title, extra = {}) {
  const res = await request(app).post(`/api/kanban/columns/${columnId}/cards`).send({ title, ...extra });
  assert.equal(res.status, 201);
  return res.body.data;
}

async function getBoard() {
  const res = await request(app).get('/api/kanban');
  assert.equal(res.status, 200);
  return res.body.data;
}

// Resumen legible del tablero: { 'Por hacer': ['A', 'B'], 'Hecho': [] }
async function boardSummary() {
  const board = await getBoard();
  return Object.fromEntries(board.columns.map((column) => [column.name, column.cards.map((card) => card.title)]));
}

// Comprueba que las posiciones guardadas son 0, 1, 2... sin huecos ni repetidos.
async function assertPositionsAreConsecutive() {
  const board = await getBoard();
  assert.deepEqual(board.columns.map((column) => column.position), board.columns.map((_, index) => index));
  for (const column of board.columns) {
    assert.deepEqual(column.cards.map((card) => card.position), column.cards.map((_, index) => index), column.name);
  }
}

/* ---------- Tablero y columnas ---------- */

describe('GET /api/kanban', () => {
  test('devuelve un tablero vacío cuando no hay columnas', async () => {
    assert.deepEqual(await getBoard(), { project: { name: '', description: '' }, columns: [] });
  });

  test('devuelve las columnas en orden, cada una con sus tarjetas en orden', async () => {
    const todo = await addColumn('Por hacer');
    const done = await addColumn('Hecho');
    await addCard(todo.id, 'A');
    await addCard(todo.id, 'B', { description: 'Detalle', priority: 'high', dueDate: '2026-12-01' });
    await addCard(done.id, 'C');

    const board = await getBoard();
    assert.deepEqual(board.columns.map((c) => [c.name, c.position]), [['Por hacer', 0], ['Hecho', 1]]);
    assert.equal('wipLimit' in board.columns[0], false);
    const [, cardB] = board.columns[0].cards;
    assert.deepEqual(
      { ...cardB, createdAt: undefined, updatedAt: undefined },
      { id: 2, columnId: todo.id, title: 'B', description: 'Detalle', priority: 'high', dueDate: '2026-12-01', position: 1, createdAt: undefined, updatedAt: undefined }
    );
    assert.ok(!Number.isNaN(Date.parse(cardB.createdAt)));
  });
});

describe('columnas', () => {
  test('POST crea la columna al final y la guarda en PostgreSQL', async () => {
    await addColumn('Primera');
    const column = await addColumn('  Segunda  ');
    assert.deepEqual([column.name, column.position], ['Segunda', 1]);

    const { rows } = await pool.query('SELECT name, position FROM kanban_columns ORDER BY position');
    assert.deepEqual(rows, [
      { name: 'Primera', position: 0 },
      { name: 'Segunda', position: 1 },
    ]);
  });

  test('POST con position inserta la columna en ese lugar y renumera las demás', async () => {
    await addColumn('A');
    await addColumn('B');
    const middle = await addColumn('Nueva', 1);
    assert.equal(middle.position, 1);
    assert.deepEqual((await getBoard()).columns.map((c) => [c.name, c.position]), [['A', 0], ['Nueva', 1], ['B', 2]]);

    const first = await addColumn('Primera', 0);
    assert.equal(first.position, 0);
    const last = await addColumn('Última', 99); // una posición mayor que el final va al final
    assert.equal(last.position, 4);
    assert.deepEqual((await getBoard()).columns.map((c) => c.name), ['Primera', 'A', 'Nueva', 'B', 'Última']);
  });

  test('POST rechaza datos no válidos con 400 y el detalle por campo', async () => {
    let res = await request(app).post('/api/kanban/columns').send({ name: ' ' });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body.error.details.map((d) => d.field), ['name']);
    res = await request(app).post('/api/kanban/columns').send({ name: 'A', position: -1 });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body.error.details.map((d) => d.field), ['position']);
  });

  test(`POST responde 409 al superar el tope de ${MAX_COLUMNS} columnas`, async () => {
    for (let i = 1; i <= MAX_COLUMNS; i += 1) await addColumn(`Columna ${i}`);
    const res = await request(app).post('/api/kanban/columns').send({ name: 'Una más' });
    assert.equal(res.status, 409);
    assert.match(res.body.error.message, /como máximo 8 columnas/);
    assert.equal((await getBoard()).columns.length, MAX_COLUMNS);
  });

  test('PUT cambia el nombre de la columna', async () => {
    const column = await addColumn('Viejo');
    const res = await request(app).put(`/api/kanban/columns/${column.id}`).send({ name: 'Nuevo' });
    assert.equal(res.status, 200);
    assert.deepEqual([res.body.data.name, res.body.data.position], ['Nuevo', 0]);
  });

  test('POST duplicate copia la columna con sus tarjetas justo a su derecha', async () => {
    const a = await addColumn('A');
    await addColumn('B');
    await addCard(a.id, 'Uno', { priority: 'high', dueDate: '2026-12-01', description: 'Detalle' });
    await addCard(a.id, 'Dos');

    const res = await request(app).post(`/api/kanban/columns/${a.id}/duplicate`);
    assert.equal(res.status, 201);
    assert.deepEqual([res.body.data.name, res.body.data.position], ['A (copia)', 1]);
    assert.notEqual(res.body.data.id, a.id);
    assert.deepEqual(
      res.body.data.cards.map((c) => [c.title, c.priority, c.dueDate, c.description, c.position, c.columnId]),
      [['Uno', 'high', '2026-12-01', 'Detalle', 0, res.body.data.id], ['Dos', 'medium', null, null, 1, res.body.data.id]]
    );

    const board = await getBoard();
    assert.deepEqual(board.columns.map((c) => c.name), ['A', 'A (copia)', 'B']);
    assert.deepEqual(board.columns[0].cards.map((c) => c.title), ['Uno', 'Dos']); // el original no cambia
  });

  test('POST duplicate recorta el nombre largo, responde 404 si no existe y 409 con el tablero lleno', async () => {
    const long = await addColumn('x'.repeat(60));
    const copy = (await request(app).post(`/api/kanban/columns/${long.id}/duplicate`)).body.data;
    assert.equal(copy.name.length, 60);
    assert.ok(copy.name.endsWith(' (copia)'));

    assert.equal((await request(app).post('/api/kanban/columns/999/duplicate')).status, 404);
    assert.equal((await request(app).post('/api/kanban/columns/abc/duplicate')).status, 400);

    for (let i = 3; i <= MAX_COLUMNS; i += 1) await addColumn(`Columna ${i}`);
    const full = await request(app).post(`/api/kanban/columns/${long.id}/duplicate`);
    assert.equal(full.status, 409);
    assert.equal((await getBoard()).columns.length, MAX_COLUMNS);
  });

  test('PUT y DELETE responden 404 si la columna no existe y 400 si el id es malformado', async () => {
    assert.equal((await request(app).put('/api/kanban/columns/999').send({ name: 'X' })).status, 404);
    assert.equal((await request(app).delete('/api/kanban/columns/999')).status, 404);
    assert.equal((await request(app).put('/api/kanban/columns/abc').send({ name: 'X' })).status, 400);
    assert.equal((await request(app).delete('/api/kanban/columns/-1')).status, 400);
  });

  test('PATCH move reordena las columnas y renumera las posiciones', async () => {
    const a = await addColumn('A');
    await addColumn('B');
    const c = await addColumn('C');

    let res = await request(app).patch(`/api/kanban/columns/${c.id}/move`).send({ position: 0 });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.columns.map((col) => col.name), ['C', 'A', 'B']);

    // Una posición mayor que el número de columnas equivale a "al final".
    res = await request(app).patch(`/api/kanban/columns/${c.id}/move`).send({ position: 99 });
    assert.deepEqual(res.body.data.columns.map((col) => col.name), ['A', 'B', 'C']);

    res = await request(app).patch(`/api/kanban/columns/${a.id}/move`).send({ position: 1 });
    assert.deepEqual(res.body.data.columns.map((col) => col.name), ['B', 'A', 'C']);
    await assertPositionsAreConsecutive();
  });

  test('PATCH move valida la posición y responde 404 si la columna no existe', async () => {
    const a = await addColumn('A');
    assert.equal((await request(app).patch(`/api/kanban/columns/${a.id}/move`).send({})).status, 400);
    assert.equal((await request(app).patch(`/api/kanban/columns/${a.id}/move`).send({ position: -1 })).status, 400);
    assert.equal((await request(app).patch('/api/kanban/columns/999/move').send({ position: 0 })).status, 404);
  });

  test('DELETE elimina la columna con sus tarjetas y renumera las demás', async () => {
    const a = await addColumn('A');
    const b = await addColumn('B');
    await addColumn('C');
    await addCard(b.id, 'Se borra con la columna');
    await addCard(a.id, 'Se conserva');

    assert.equal((await request(app).delete(`/api/kanban/columns/${b.id}`)).status, 204);
    assert.deepEqual(await boardSummary(), { A: ['Se conserva'], C: [] });
    await assertPositionsAreConsecutive();
    const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM kanban_cards');
    assert.equal(rows[0].count, 1);
  });
});

/* ---------- Tarjetas ---------- */

describe('tarjetas', () => {
  test('POST crea la tarjeta al final de su columna con valores por defecto', async () => {
    const column = await addColumn('A');
    await addCard(column.id, 'Primera');
    const card = await addCard(column.id, '  Segunda  ');
    assert.deepEqual(
      [card.title, card.description, card.priority, card.dueDate, card.position, card.columnId],
      ['Segunda', null, 'medium', null, 1, column.id]
    );
  });

  test('POST rechaza datos no válidos (400) y columnas inexistentes (404)', async () => {
    const column = await addColumn('A');
    const invalid = await request(app).post(`/api/kanban/columns/${column.id}/cards`).send({ title: '', dueDate: '2026-02-30' });
    assert.equal(invalid.status, 400);
    assert.deepEqual(invalid.body.error.details.map((d) => d.field), ['title', 'dueDate']);
    assert.equal((await request(app).post('/api/kanban/columns/999/cards').send({ title: 'X' })).status, 404);
    assert.equal((await request(app).post('/api/kanban/columns/abc/cards').send({ title: 'X' })).status, 400);
  });

  test(`POST responde 409 al superar el tope de ${MAX_CARDS_PER_COLUMN} tarjetas por columna`, async () => {
    const column = await addColumn('Llena');
    await pool.query(
      `INSERT INTO kanban_cards (column_id, title, position)
       SELECT $1, 'Tarjeta ' || n, n - 1 FROM generate_series(1, $2::int) AS n`,
      [column.id, MAX_CARDS_PER_COLUMN]
    );
    const res = await request(app).post(`/api/kanban/columns/${column.id}/cards`).send({ title: 'Una más' });
    assert.equal(res.status, 409);
    assert.match(res.body.error.message, /como máximo 50 tarjetas/);
  });

  test('PUT edita la tarjeta sin cambiar su columna ni su posición', async () => {
    const column = await addColumn('A');
    await addCard(column.id, 'Otra');
    const card = await addCard(column.id, 'Original', { priority: 'high', dueDate: '2026-12-01' });

    const res = await request(app).put(`/api/kanban/cards/${card.id}`).send({ title: 'Editada', description: 'Nueva' });
    assert.equal(res.status, 200);
    assert.deepEqual(
      [res.body.data.title, res.body.data.description, res.body.data.priority, res.body.data.dueDate, res.body.data.position, res.body.data.columnId],
      ['Editada', 'Nueva', 'medium', null, 1, column.id]
    );
  });

  test('PUT, PATCH move y DELETE responden 404 si la tarjeta no existe y 400 si el id es malformado', async () => {
    const column = await addColumn('A');
    assert.equal((await request(app).put('/api/kanban/cards/999').send({ title: 'X' })).status, 404);
    assert.equal((await request(app).patch('/api/kanban/cards/999/move').send({ columnId: column.id })).status, 404);
    assert.equal((await request(app).delete('/api/kanban/cards/999')).status, 404);
    assert.equal((await request(app).put('/api/kanban/cards/1.5').send({ title: 'X' })).status, 400);
    assert.equal((await request(app).delete('/api/kanban/cards/abc')).status, 400);
  });

  test('DELETE elimina la tarjeta y cierra el hueco en las posiciones', async () => {
    const column = await addColumn('A');
    await addCard(column.id, 'Uno');
    const two = await addCard(column.id, 'Dos');
    await addCard(column.id, 'Tres');

    assert.equal((await request(app).delete(`/api/kanban/cards/${two.id}`)).status, 204);
    assert.deepEqual(await boardSummary(), { A: ['Uno', 'Tres'] });
    await assertPositionsAreConsecutive();
  });
});

/* ---------- Movimientos ---------- */

describe('mover tarjetas', () => {
  let todo;
  let doing;
  let cards;

  beforeEach(async () => {
    todo = await addColumn('Por hacer');
    doing = await addColumn('En curso');
    cards = {};
    for (const title of ['A', 'B', 'C']) cards[title] = await addCard(todo.id, title);
    cards.X = await addCard(doing.id, 'X');
  });

  const move = (card, body) => request(app).patch(`/api/kanban/cards/${card.id}/move`).send(body);

  test('dentro de la misma columna: sube, baja y va al final', async () => {
    await move(cards.C, { columnId: todo.id, position: 0 });
    assert.deepEqual((await boardSummary())['Por hacer'], ['C', 'A', 'B']);

    await move(cards.C, { columnId: todo.id, position: 1 });
    assert.deepEqual((await boardSummary())['Por hacer'], ['A', 'C', 'B']);

    await move(cards.A, { columnId: todo.id });
    assert.deepEqual((await boardSummary())['Por hacer'], ['C', 'B', 'A']);
    await assertPositionsAreConsecutive();
  });

  test('a otra columna: en la posición pedida, y la de origen queda sin huecos', async () => {
    const res = await move(cards.B, { columnId: doing.id, position: 0 });
    assert.equal(res.status, 200);
    assert.deepEqual([res.body.data.columnId, res.body.data.position], [doing.id, 0]);
    assert.deepEqual(await boardSummary(), { 'Por hacer': ['A', 'C'], 'En curso': ['B', 'X'] });
    await assertPositionsAreConsecutive();
  });

  test('a otra columna sin posición, o con una posición demasiado alta: va al final', async () => {
    await move(cards.A, { columnId: doing.id });
    await move(cards.B, { columnId: doing.id, position: 99 });
    assert.deepEqual(await boardSummary(), { 'Por hacer': ['C'], 'En curso': ['X', 'A', 'B'] });
    await assertPositionsAreConsecutive();
  });

  test('moverla a donde ya está no cambia nada', async () => {
    await move(cards.B, { columnId: todo.id, position: 1 });
    assert.deepEqual(await boardSummary(), { 'Por hacer': ['A', 'B', 'C'], 'En curso': ['X'] });
  });

  test('rechaza destinos inexistentes (404) y datos no válidos (400) sin mover nada', async () => {
    assert.equal((await move(cards.A, { columnId: 999 })).status, 404);
    assert.equal((await move(cards.A, {})).status, 400);
    assert.equal((await move(cards.A, { columnId: doing.id, position: -1 })).status, 400);
    assert.equal((await move(cards.A, { columnId: doing.id, position: 'primera' })).status, 400);
    assert.deepEqual(await boardSummary(), { 'Por hacer': ['A', 'B', 'C'], 'En curso': ['X'] });
  });

  test('responde 409 si la columna de destino ya está llena', async () => {
    await pool.query(
      `INSERT INTO kanban_cards (column_id, title, position)
       SELECT $1, 'Relleno ' || n, n FROM generate_series(1, $2::int) AS n`,
      [doing.id, MAX_CARDS_PER_COLUMN - 1]
    );
    assert.equal((await move(cards.A, { columnId: doing.id })).status, 409);
    assert.deepEqual((await boardSummary())['Por hacer'], ['A', 'B', 'C']);
  });
});

describe('acciones sobre todas las tarjetas de una columna', () => {
  let todo;
  let done;

  beforeEach(async () => {
    todo = await addColumn('Por hacer');
    done = await addColumn('Hecho');
    await addCard(todo.id, 'A');
    await addCard(todo.id, 'B');
    await addCard(done.id, 'X');
  });

  test('DELETE /columns/:id/cards vacía la columna y conserva la columna', async () => {
    assert.equal((await request(app).delete(`/api/kanban/columns/${todo.id}/cards`)).status, 204);
    assert.deepEqual(await boardSummary(), { 'Por hacer': [], Hecho: ['X'] });
    assert.equal((await request(app).delete('/api/kanban/columns/999/cards')).status, 404);
  });

  test('POST move-cards pasa todas las tarjetas al final de la otra columna, en su orden', async () => {
    const res = await request(app).post(`/api/kanban/columns/${todo.id}/move-cards`).send({ targetColumnId: done.id });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.columns.map((c) => c.cards.map((card) => card.title)), [[], ['X', 'A', 'B']]);
    await assertPositionsAreConsecutive();
  });

  test('POST move-cards valida el destino', async () => {
    const send = (id, body) => request(app).post(`/api/kanban/columns/${id}/move-cards`).send(body);
    assert.equal((await send(todo.id, {})).status, 400);
    assert.equal((await send(todo.id, { targetColumnId: todo.id })).status, 400);
    assert.equal((await send(todo.id, { targetColumnId: 999 })).status, 404);
    assert.equal((await send(999, { targetColumnId: done.id })).status, 404);
    assert.deepEqual(await boardSummary(), { 'Por hacer': ['A', 'B'], Hecho: ['X'] });
  });

  test('POST move-cards responde 409 si no caben todas, y no mueve ninguna', async () => {
    await pool.query(
      `INSERT INTO kanban_cards (column_id, title, position)
       SELECT $1, 'Relleno ' || n, n FROM generate_series(1, $2::int) AS n`,
      [done.id, MAX_CARDS_PER_COLUMN - 2]
    );
    const res = await request(app).post(`/api/kanban/columns/${todo.id}/move-cards`).send({ targetColumnId: done.id });
    assert.equal(res.status, 409);
    assert.deepEqual((await boardSummary())['Por hacer'], ['A', 'B']);
  });
});

describe('transacciones', () => {
  test('si una operación falla a mitad, ROLLBACK deja el tablero como estaba', async () => {
    const { withTransaction } = require('../src/db/transaction');
    const column = await addColumn('A');
    await addCard(column.id, 'Sobrevive');

    await assert.rejects(
      withTransaction(async (db) => {
        await db.query('DELETE FROM kanban_cards');
        throw new Error('fallo simulado');
      }),
      /fallo simulado/
    );
    assert.deepEqual(await boardSummary(), { A: ['Sobrevive'] });
  });
});

describe('proyecto (título y descripción del tablero)', () => {
  test('GET /api/kanban devuelve el proyecto vacío al principio', async () => {
    assert.deepEqual((await getBoard()).project, { name: '', description: '' });
  });

  test('PUT /project guarda título y descripción en PostgreSQL y el tablero los devuelve', async () => {
    const res = await request(app).put('/api/kanban/project').send({ name: '  Mi proyecto ', description: 'Algo breve' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, { name: 'Mi proyecto', description: 'Algo breve' });

    const { rows } = await pool.query('SELECT name, description FROM kanban_project');
    assert.deepEqual(rows, [{ name: 'Mi proyecto', description: 'Algo breve' }]);
    assert.deepEqual((await getBoard()).project, { name: 'Mi proyecto', description: 'Algo breve' });
  });

  test('PUT /project con campos vacíos o ausentes los deja sin definir', async () => {
    await request(app).put('/api/kanban/project').send({ name: 'X', description: 'Y' });
    const res = await request(app).put('/api/kanban/project').send({ name: '' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, { name: '', description: '' });
  });

  test('PUT /project rechaza textos demasiado largos o que no son texto', async () => {
    let res = await request(app).put('/api/kanban/project').send({ name: 'x'.repeat(101), description: 'y'.repeat(301) });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body.error.details.map((d) => d.field), ['name', 'description']);
    res = await request(app).put('/api/kanban/project').send({ name: 5 });
    assert.equal(res.status, 400);
    res = await request(app).put('/api/kanban/project').send([]);
    assert.equal(res.status, 400);
  });
});
