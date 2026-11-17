// Prueba la función pura que decide en qué posición cae un elemento arrastrado.
// El arrastre en sí (eventos del navegador) no se puede probar con node:test: se comprueba a mano.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

let positionAmong;

describe('positionAmong', async () => {
  ({ positionAmong } = await import('../public/js/dropPosition.js'));

  // Tres columnas en fila, de 100 px de ancho: centros en 50, 160 y 270.
  const row = [
    { left: 0, width: 100 },
    { left: 110, width: 100 },
    { left: 220, width: 100 },
  ];
  // Tres elementos apilados, de 50 px de alto: centros en 25, 85 y 145.
  const stack = [
    { top: 0, height: 50 },
    { top: 60, height: 50 },
    { top: 120, height: 50 },
  ];

  test('en fila usa la X: antes, entre y después de las columnas', () => {
    assert.equal(positionAmong(row, 10, true), 0);
    assert.equal(positionAmong(row, 100, true), 1);
    assert.equal(positionAmong(row, 200, true), 2);
    assert.equal(positionAmong(row, 400, true), 3);
  });

  test('apilados usa la Y', () => {
    assert.equal(positionAmong(stack, 5, false), 0);
    assert.equal(positionAmong(stack, 60, false), 1);
    assert.equal(positionAmong(stack, 200, false), 3);
  });

  test('sin otros elementos la posición es 0', () => {
    assert.equal(positionAmong([], 100, true), 0);
  });

  test('justo en la mitad de un elemento cuenta como antes de él', () => {
    assert.equal(positionAmong(row, 50, true), 0);
  });
});
