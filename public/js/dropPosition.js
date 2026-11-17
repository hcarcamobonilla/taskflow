// Calcula en qué posición quedaría un elemento arrastrado entre otros.
// boxes: rectángulos (getBoundingClientRect) de los demás elementos, en orden y sin el arrastrado.
// pointer: coordenada del puntero (X si horizontal, Y si no).
// La posición es cuántos elementos tienen su mitad antes del puntero.
// Es una función pura para poder probarla sin navegador.

export function positionAmong(boxes, pointer, horizontal) {
  return boxes.filter((box) =>
    horizontal ? pointer > box.left + box.width / 2 : pointer > box.top + box.height / 2
  ).length;
}
