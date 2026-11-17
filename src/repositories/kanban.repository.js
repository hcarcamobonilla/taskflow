// Acceso a datos del tablero Kanban: todas las consultas SQL de kanban_columns y kanban_cards.
// Los valores del usuario viajan SIEMPRE como parámetros ($1, $2...), nunca concatenados.
//
// Cada función recibe `db` como primer argumento: puede ser el pool (consulta suelta) o el
// cliente de una transacción (ver src/db/transaction.js). Así la misma consulta sirve
// para los dos casos.

const COLUMN_FIELDS = `
  id, name, position, wip_limit AS "wipLimit",
  created_at AS "createdAt", updated_at AS "updatedAt"`;

const CARD_FIELDS = `
  id, column_id AS "columnId", title, description, priority,
  due_date AS "dueDate", position, created_at AS "createdAt", updated_at AS "updatedAt"`;

/* ---------- Columnas ---------- */

async function findColumns(db) {
  const { rows } = await db.query(`SELECT ${COLUMN_FIELDS} FROM kanban_columns ORDER BY position, id`);
  return rows;
}

// Ids de todas las columnas en su orden. FOR UPDATE las bloquea hasta el final de la
// transacción para que nadie más cambie el orden mientras se renumera.
async function lockAllColumnIds(db) {
  const { rows } = await db.query('SELECT id FROM kanban_columns ORDER BY position, id FOR UPDATE');
  return rows.map((row) => row.id);
}

// Bloquea las columnas indicadas y devuelve los ids que existen.
// Se bloquean siempre en orden de id para que dos operaciones no se esperen mutuamente.
async function lockColumns(db, ids) {
  const { rows } = await db.query(
    'SELECT id FROM kanban_columns WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE',
    [ids]
  );
  return rows.map((row) => row.id);
}

async function insertColumn(db, { name, wipLimit }, position) {
  const { rows } = await db.query(
    `INSERT INTO kanban_columns (name, wip_limit, position)
     VALUES ($1, $2, $3)
     RETURNING ${COLUMN_FIELDS}`,
    [name, wipLimit, position]
  );
  return rows[0];
}

async function updateColumn(db, id, { name, wipLimit }) {
  const { rows } = await db.query(
    `UPDATE kanban_columns SET name = $1, wip_limit = $2 WHERE id = $3 RETURNING ${COLUMN_FIELDS}`,
    [name, wipLimit, id]
  );
  return rows[0] || null;
}

// Las tarjetas de la columna se eliminan solas (ON DELETE CASCADE).
async function deleteColumn(db, id) {
  await db.query('DELETE FROM kanban_columns WHERE id = $1', [id]);
}

// Guarda el orden de las columnas: la posición de cada una es su lugar en el arreglo `ids`.
// unnest(...) WITH ORDINALITY convierte el arreglo en filas (id, número de orden desde 1).
// Solo se actualizan las filas cuya posición cambia.
async function saveColumnOrder(db, ids) {
  await db.query(
    `UPDATE kanban_columns AS c
     SET position = (o.ordinality - 1)::int
     FROM unnest($1::int[]) WITH ORDINALITY AS o(id, ordinality)
     WHERE c.id = o.id AND c.position <> (o.ordinality - 1)::int`,
    [ids]
  );
}

/* ---------- Tarjetas ---------- */

async function findCards(db) {
  const { rows } = await db.query(`SELECT ${CARD_FIELDS} FROM kanban_cards ORDER BY column_id, position, id`);
  return rows;
}

async function findCard(db, id) {
  const { rows } = await db.query(`SELECT ${CARD_FIELDS} FROM kanban_cards WHERE id = $1`, [id]);
  return rows[0] || null;
}

// Ids de las tarjetas de una columna, en su orden.
async function findCardIds(db, columnId) {
  const { rows } = await db.query(
    'SELECT id FROM kanban_cards WHERE column_id = $1 ORDER BY position, id',
    [columnId]
  );
  return rows.map((row) => row.id);
}

async function insertCard(db, columnId, { title, description, priority, dueDate }, position) {
  const { rows } = await db.query(
    `INSERT INTO kanban_cards (column_id, title, description, priority, due_date, position)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${CARD_FIELDS}`,
    [columnId, title, description, priority, dueDate, position]
  );
  return rows[0];
}

async function updateCard(db, id, { title, description, priority, dueDate }) {
  const { rows } = await db.query(
    `UPDATE kanban_cards
     SET title = $1, description = $2, priority = $3, due_date = $4
     WHERE id = $5
     RETURNING ${CARD_FIELDS}`,
    [title, description, priority, dueDate, id]
  );
  return rows[0] || null;
}

async function deleteCard(db, id) {
  await db.query('DELETE FROM kanban_cards WHERE id = $1', [id]);
}

async function deleteCardsOfColumn(db, columnId) {
  await db.query('DELETE FROM kanban_cards WHERE column_id = $1', [columnId]);
}

// Deja en la columna `columnId` las tarjetas `ids`, en ese orden. Sirve tanto para
// reordenar dentro de una columna como para traer tarjetas desde otra.
async function saveCardOrder(db, columnId, ids) {
  await db.query(
    `UPDATE kanban_cards AS c
     SET column_id = $1, position = (o.ordinality - 1)::int
     FROM unnest($2::int[]) WITH ORDINALITY AS o(id, ordinality)
     WHERE c.id = o.id AND (c.column_id <> $1 OR c.position <> (o.ordinality - 1)::int)`,
    [columnId, ids]
  );
}

module.exports = {
  findColumns,
  lockAllColumnIds,
  lockColumns,
  insertColumn,
  updateColumn,
  deleteColumn,
  saveColumnOrder,
  findCards,
  findCard,
  findCardIds,
  insertCard,
  updateCard,
  deleteCard,
  deleteCardsOfColumn,
  saveCardOrder,
};
