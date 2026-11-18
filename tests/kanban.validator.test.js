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
  test('limpia el nombre y devuelve solo el nombre', () => {
    assert.deepEqual(validator.validateColumn({ name: '  Por hacer  ' }), { name: 'Por hacer' });
    assert.deepEqual(validator.validateColumn({ name: 'A', wipLimit: 3 }), { name: 'A' }); // el límite WIP ya no existe
  });

  test('rechaza nombres vacíos, no textuales o de más de 60 caracteres', () => {
    for (const name of [undefined, '', '   ', 7, 'x'.repeat(61)]) {
      assert.deepEqual(errorFields(() => validator.validateColumn({ name })), ['name']);
    }
    assert.equal(validator.validateColumn({ name: 'x'.repeat(60) }).name.length, 60);
  });

  test('rechaza cuerpos que no son un objeto', () => {
    for (const body of [null, 'texto', []]) {
      assert.deepEqual(errorFields(() => validator.validateColumn(body)), ['body']);
    }
  });
});

describe('validateNewColumn', () => {
  test('la posición es opcional: sin ella queda en null', () => {
    assert.deepEqual(validator.validateNewColumn({ name: 'A' }), { name: 'A', position: null });
    assert.deepEqual(validator.validateNewColumn({ name: 'A', position: '' }), { name: 'A', position: null });
    assert.deepEqual(validator.validateNewColumn({ name: 'A', position: 0 }), { name: 'A', position: 0 });
  });

  test('rechaza posiciones negativas, decimales o que no son números', () => {
    for (const position of [-1, 1.5, '2', true]) {
      assert.deepEqual(errorFields(() => validator.validateNewColumn({ name: 'A', position })), ['position']);
    }
  });
});

describe('copyColumnName', () => {
  test('añade «(copia)» y recorta el nombre para no pasar de 60 caracteres', () => {
    assert.equal(validator.copyColumnName('Por hacer'), 'Por hacer (copia)');
    const copy = validator.copyColumnName('x'.repeat(60));
    assert.equal(copy.length, 60);
    assert.ok(copy.endsWith('x (copia)'));
  });
});

describe('validateProject', () => {
  test('limpia los textos y deja vacío lo que falta', () => {
    assert.deepEqual(validator.validateProject({ name: '  Mi app ', description: ' Breve ' }), { name: 'Mi app', description: 'Breve' });
    assert.deepEqual(validator.validateProject({}), { name: '', description: '' });
    assert.deepEqual(validator.validateProject({ name: null, description: '' }), { name: '', description: '' });
  });

  test('rechaza textos largos (100 y 300) o que no son texto', () => {
    assert.deepEqual(errorFields(() => validator.validateProject({ name: 'x'.repeat(101) })), ['name']);
    assert.deepEqual(errorFields(() => validator.validateProject({ description: 'y'.repeat(301) })), ['description']);
    assert.deepEqual(errorFields(() => validator.validateProject({ name: 3, description: false })), ['name', 'description']);
    assert.equal(validator.validateProject({ name: 'x'.repeat(100), description: 'y'.repeat(300) }).name.length, 100);
    assert.deepEqual(errorFields(() => validator.validateProject(null)), ['body']);
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

describe('validateCompleted', () => {
  test('acepta true y false', () => {
    assert.equal(validator.validateCompleted({ completed: true }), true);
    assert.equal(validator.validateCompleted({ completed: false }), false);
  });

  test('rechaza lo que no sea un booleano y los cuerpos que no son un objeto', () => {
    for (const completed of [undefined, null, 'true', 1, 0, {}]) {
      assert.deepEqual(errorFields(() => validator.validateCompleted({ completed })), ['completed']);
    }
    assert.deepEqual(errorFields(() => validator.validateCompleted(null)), ['body']);
  });
});
