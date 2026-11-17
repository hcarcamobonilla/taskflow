// Arrastrar y soltar con el ratón (API Drag and Drop de HTML5): tarjetas y columnas.
// Es un complemento: las columnas también se mueven con los botones de su menú de opciones,
// que funcionan con teclado, lector de pantalla y pantallas táctiles. Las tarjetas solo
// se mueven arrastrándolas.

import { positionAmong } from './dropPosition.js';

let draggedCard = null;
let draggedColumn = null;

// Línea que marca dónde caerá la tarjeta mientras se arrastra.
const marker = document.createElement('li');
marker.className = 'drop-marker';
marker.setAttribute('aria-hidden', 'true');

// Línea que marca dónde caerá la columna mientras se arrastra.
const columnMarker = document.createElement('li');
columnMarker.className = 'column-drop-marker';
columnMarker.setAttribute('aria-hidden', 'true');

function cardsOf(list) {
  return [...list.querySelectorAll('.card:not(.dragging)')];
}

function columnsOf(board) {
  return [...board.querySelectorAll('.board-column:not(.dragging)')];
}

const boxesOf = (elements) => elements.map((element) => element.getBoundingClientRect());

// Posición en la que quedaría la tarjeta: cuántas tarjetas tienen su mitad por encima del puntero.
function dropPosition(list, pointerY) {
  return positionAmong(boxesOf(cardsOf(list)), pointerY, false);
}

// En pantallas anchas las columnas van en fila; en pantallas estrechas, apiladas.
function isRow(board) {
  return getComputedStyle(board).flexDirection === 'row';
}

function columnDropPosition(board, event) {
  const row = isRow(board);
  return positionAmong(boxesOf(columnsOf(board)), row ? event.clientX : event.clientY, row);
}

function clearDropState(board) {
  marker.remove();
  columnMarker.remove();
  for (const column of board.querySelectorAll('.drop-target')) column.classList.remove('drop-target');
}

function startCardDrag(event, card) {
  draggedCard = card;
  card.classList.add('dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', card.dataset.cardId);
}

// Solo el asa de la columna inicia el arrastre; la imagen que se ve al arrastrar es la columna entera.
function startColumnDrag(event, column) {
  draggedColumn = column;
  column.classList.add('dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', column.dataset.columnId);
  event.dataTransfer.setDragImage(column, 20, 20);
}

function overColumnDrag(event, board) {
  event.preventDefault(); // sin esto el navegador no permite soltar aquí
  event.dataTransfer.dropEffect = 'move';
  const before = columnsOf(board)[columnDropPosition(board, event)] || null;
  clearDropState(board);
  board.insertBefore(columnMarker, before);
}

function overCardDrag(event, board) {
  const column = event.target.closest('.board-column');
  if (!column) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';

  const list = column.querySelector('.card-list');
  const before = cardsOf(list)[dropPosition(list, event.clientY)] || null;
  clearDropState(board);
  column.classList.add('drop-target');
  list.insertBefore(marker, before);
}

// board: elemento que contiene las columnas.
// onDropCard(cardId, columnId, position) y onDropColumn(columnId, position) se llaman al soltar.
export function enableDrag(board, { onDropCard, onDropColumn }) {
  board.addEventListener('dragstart', (event) => {
    const handle = event.target.closest('.column-handle');
    if (handle) return startColumnDrag(event, handle.closest('.board-column'));
    const card = event.target.closest('.card');
    if (card) startCardDrag(event, card);
  });

  board.addEventListener('dragover', (event) => {
    if (draggedColumn) overColumnDrag(event, board);
    else if (draggedCard) overCardDrag(event, board);
  });

  board.addEventListener('drop', (event) => {
    if (draggedColumn) {
      event.preventDefault();
      const position = columnDropPosition(board, event);
      const columnId = draggedColumn.dataset.columnId;
      clearDropState(board);
      onDropColumn(columnId, position);
      return;
    }
    const column = draggedCard && event.target.closest('.board-column');
    if (!column) return;
    event.preventDefault();
    const list = column.querySelector('.card-list');
    const position = dropPosition(list, event.clientY);
    const cardId = draggedCard.dataset.cardId;
    clearDropState(board);
    onDropCard(cardId, column.dataset.columnId, position);
  });

  board.addEventListener('dragend', () => {
    draggedCard?.classList.remove('dragging');
    draggedColumn?.classList.remove('dragging');
    draggedCard = null;
    draggedColumn = null;
    clearDropState(board);
  });
}
