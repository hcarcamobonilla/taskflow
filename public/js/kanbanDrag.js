// Arrastrar y soltar tarjetas con el ratón (API Drag and Drop de HTML5).
// Es un complemento: todo lo que se hace arrastrando también puede hacerse con los botones
// de cada tarjeta, que funcionan con teclado, lector de pantalla y pantallas táctiles.

let draggedCard = null;

// Línea que marca dónde caerá la tarjeta mientras se arrastra.
const marker = document.createElement('li');
marker.className = 'drop-marker';
marker.setAttribute('aria-hidden', 'true');

function cardsOf(list) {
  return [...list.querySelectorAll('.card:not(.dragging)')];
}

// Posición en la que quedaría la tarjeta: cuántas tarjetas tienen su mitad por encima del puntero.
function dropPosition(list, pointerY) {
  return cardsOf(list).filter((card) => {
    const box = card.getBoundingClientRect();
    return pointerY > box.top + box.height / 2;
  }).length;
}

function clearDropState(board) {
  marker.remove();
  for (const column of board.querySelectorAll('.drop-target')) column.classList.remove('drop-target');
}

// board: elemento que contiene las columnas. onDrop(cardId, columnId, position) se llama al soltar.
export function enableCardDrag(board, onDrop) {
  board.addEventListener('dragstart', (event) => {
    const card = event.target.closest('.card');
    if (!card) return;
    draggedCard = card;
    card.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', card.dataset.cardId);
  });

  board.addEventListener('dragover', (event) => {
    const column = draggedCard && event.target.closest('.board-column');
    if (!column) return;
    event.preventDefault(); // sin esto el navegador no permite soltar aquí
    event.dataTransfer.dropEffect = 'move';

    const list = column.querySelector('.card-list');
    const before = cardsOf(list)[dropPosition(list, event.clientY)] || null;
    clearDropState(board);
    column.classList.add('drop-target');
    list.insertBefore(marker, before);
  });

  board.addEventListener('drop', (event) => {
    const column = draggedCard && event.target.closest('.board-column');
    if (!column) return;
    event.preventDefault();
    const list = column.querySelector('.card-list');
    const position = dropPosition(list, event.clientY);
    const cardId = draggedCard.dataset.cardId;
    clearDropState(board);
    onDrop(cardId, column.dataset.columnId, position);
  });

  board.addEventListener('dragend', () => {
    if (draggedCard) draggedCard.classList.remove('dragging');
    draggedCard = null;
    clearDropState(board);
  });
}
