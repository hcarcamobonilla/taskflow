// Pruebas unitarias de validación: no usan red ni base de datos.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const validator = require('../src/validators/tasks.validator');
const HttpError = require('../src/utils/HttpError');

function assertInvalid(fn, field) {
  assert.throws(fn, (err) => {
    assert.ok(err instanceof HttpError);
    assert.equal(err.status, 400);
    assert.ok(err.details.some((d) => d.field === field), `se esperaba error en ${field}`);
    return true;
  });
}

describe('validateTask', () => {
  test('aplica valores por defecto y recorta espacios', () => {
    const task = validator.validateTask({ title: '  Comprar pan  ' });
    assert.deepEqual(task, {
      title: 'Comprar pan',
      description: null,
      status: 'pending',
      priority: 'medium',
      dueDate: null,
    });
  });

  test('acepta una tarea completa válida', () => {
    const input = { title: 'A', description: 'B', status: 'in_progress', priority: 'high', dueDate: '2026-12-31' };
    assert.deepEqual(validator.validateTask(input), input);
  });

  test('rechaza título ausente, vacío, solo espacios o no textual', () => {
    for (const title of [undefined, '', '   ', 123, null]) {
      assertInvalid(() => validator.validateTask({ title }), 'title');
    }
  });

  test('rechaza título de más de 150 caracteres', () => {
    assertInvalid(() => validator.validateTask({ title: 'x'.repeat(151) }), 'title');
  });

  test('rechaza estado y prioridad fuera de la lista', () => {
    assertInvalid(() => validator.validateTask({ title: 'A', status: 'done' }), 'status');
    assertInvalid(() => validator.validateTask({ title: 'A', priority: 'urgent' }), 'priority');
  });

  test('rechaza fechas inválidas o con otro formato', () => {
    for (const dueDate of ['2026-02-30', '31/12/2026', '2026-13-01', 'mañana', 20261231]) {
      assertInvalid(() => validator.validateTask({ title: 'A', dueDate }), 'dueDate');
    }
  });

  test('acumula todos los errores en una sola respuesta', () => {
    assert.throws(
      () => validator.validateTask({ title: '', status: 'x', priority: 'y', dueDate: 'z' }),
      (err) => err.details.length === 4
    );
  });

  test('rechaza cuerpos que no son un objeto', () => {
    for (const body of [null, [], 'texto', undefined]) {
      assertInvalid(() => validator.validateTask(body), 'body');
    }
  });
});

describe('parseId', () => {
  test('acepta enteros positivos', () => {
    assert.equal(validator.parseId('42'), 42);
  });

  test('rechaza ids no numéricos, negativos, decimales o fuera de rango', () => {
    for (const raw of ['abc', '-1', '0', '1.5', '1e3', '99999999999', '1; DROP TABLE tasks']) {
      assertInvalid(() => validator.parseId(raw), 'id');
    }
  });
});

describe('validateStatus', () => {
  test('acepta los tres estados', () => {
    for (const status of validator.STATUSES) {
      assert.equal(validator.validateStatus({ status }), status);
    }
  });

  test('rechaza estados desconocidos o ausentes', () => {
    assertInvalid(() => validator.validateStatus({ status: 'archived' }), 'status');
    assertInvalid(() => validator.validateStatus({}), 'status');
    assertInvalid(() => validator.validateStatus(undefined), 'status');
  });
});

describe('validateListQuery', () => {
  test('usa orden por fecha de creación descendente por defecto', () => {
    assert.deepEqual(validator.validateListQuery({}), { sort: 'created_at', order: 'desc' });
  });

  test('acepta filtros válidos e ignora los vacíos', () => {
    const filters = validator.validateListQuery({ status: 'pending', priority: '', q: '  api ', sort: 'priority', order: 'asc' });
    assert.deepEqual(filters, { status: 'pending', q: 'api', sort: 'priority', order: 'asc' });
  });

  test('rechaza valores fuera de las listas blancas', () => {
    assertInvalid(() => validator.validateListQuery({ status: 'x' }), 'status');
    assertInvalid(() => validator.validateListQuery({ priority: 'x' }), 'priority');
    assertInvalid(() => validator.validateListQuery({ sort: 'title; DROP TABLE tasks' }), 'sort');
    assertInvalid(() => validator.validateListQuery({ order: 'up' }), 'order');
    assertInvalid(() => validator.validateListQuery({ q: 'x'.repeat(101) }), 'q');
  });
});
