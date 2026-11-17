// Pruebas unitarias de la validación del tablero Kanban (sin base de datos).

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const validator = require('../src/validators/kanban.validator');

// Devuelve los campos con error de una validación que debe fallar con 400.
function errorFields(fn) {
  try {
    fn();
  } catch (error) {
    assert.equal(error.status, 400);
    return error.details.map((detail) => detail.field);
  }
  assert.fail('La validación debía fallar');
}

describe('validateColumn', () => {
  test('limpia el nombre y deja el límite WIP en null si no se envía', () => {
    assert.deepEqual(validator.validateColumn({ name: '  Por hacer  ' }), { name: 'Por hacer', wipLimit: null });
    assert.deepEqual(validator.validateColumn({ name: 'A', wipLimit: '' }), { name: 'A', wipLimit: null });
    assert.deepEqual(validator.validateColumn({ name: 'A', wipLimit: 3 }), { name: 'A', wipLimit: 3 });
  });

  test('rechaza nombres vacíos, no textuales o de más de 60 caracteres', () => {
    for (const name of [undefined, '', '   ', 7, 'x'.repeat(61)]) {
      assert.deepEqual(errorFields(() => validator.validateColumn({ name })), ['name']);
    }
    assert.equal(validator.validateColumn({ name: 'x'.repeat(60) }).name.length, 60);
  });

  test('rechaza límites WIP que no sean enteros entre 1 y 50', () => {
    for (const wipLimit of [0, -1, 51, 2.5, '3', true]) {
      assert.deepEqual(errorFields(() => validator.validateColumn({ name: 'A', wipLimit })), ['wipLimit']);
    }
    assert.equal(validator.validateColumn({ name: 'A', wipLimit: 50 }).wipLimit, 50);
  });

  test('rechaza cuerpos que no son un objeto', () => {
    for (const body of [null, 'texto', []]) {
      assert.deepEqual(errorFields(() => validator.validateColumn(body)), ['body']);
    }
  });
});

describe('validateCard', () => {
  test('aplica valores por defecto y limpia espacios', () => {
    assert.deepEqual(validator.validateCard({ title: '  Tarjeta  ', description: '   ' }), {
      title: 'Tarjeta',
      description: null,
      priority: 'medium',
      dueDate: null,
    });
  });

  test('acepta una tarjeta completa', () => {
    const card = { title: 'T', description: 'D', priority: 'high', dueDate: '2028-02-29' };
    assert.deepEqual(validator.validateCard(card), card);
  });

  test('informa de todos los campos incorrectos a la vez', () => {
    const fields = errorFields(() =>
      validator.validateCard({ title: '', description: 5, priority: 'urgent', dueDate: '2026-02-30' })
    );
    assert.deepEqual(fields, ['title', 'description', 'priority', 'dueDate']);
  });

  test('no admite el campo estado: una tarjeta no lo tiene', () => {
    assert.equal('status' in validator.validateCard({ title: 'T', status: 'completed' }), false);
  });
});

describe('movimientos', () => {
  test('validateColumnMove exige una posición entera no negativa', () => {
    assert.equal(validator.validateColumnMove({ position: 0 }), 0);
    for (const position of [undefined, null, -1, 1.5, '1']) {
      assert.deepEqual(errorFields(() => validator.validateColumnMove({ position })), ['position']);
    }
  });

  test('validateCardMove exige columna de destino; la posición es opcional', () => {
    assert.deepEqual(validator.validateCardMove({ columnId: 2 }), { columnId: 2, position: null });
    assert.deepEqual(validator.validateCardMove({ columnId: '2', position: 1 }), { columnId: 2, position: 1 });
    assert.deepEqual(errorFields(() => validator.validateCardMove({})), ['columnId']);
    assert.deepEqual(errorFields(() => validator.validateCardMove({ columnId: 'abc' })), ['columnId']);
    assert.deepEqual(errorFields(() => validator.validateCardMove({ columnId: 0 })), ['columnId']);
    assert.deepEqual(errorFields(() => validator.validateCardMove({ columnId: 1, position: -1 })), ['position']);
  });

  test('validateMoveAllCards exige un destino distinto del origen', () => {
    assert.equal(validator.validateMoveAllCards({ targetColumnId: 2 }, 1), 2);
    assert.deepEqual(errorFields(() => validator.validateMoveAllCards({}, 1)), ['targetColumnId']);
    assert.deepEqual(errorFields(() => validator.validateMoveAllCards({ targetColumnId: 1 }, 1)), ['targetColumnId']);
  });
});
