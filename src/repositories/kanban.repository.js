// Acceso a datos del tablero Kanban: todas las consultas SQL de kanban_columns y kanban_cards.
// Los valores del usuario viajan SIEMPRE como parámetros ($1, $2...), nunca concatenados.
//
// Cada función recibe `db` como primer argumento: puede ser el pool (consulta suelta) o el
// cliente de una transacción (ver src/db/transaction.js). Así la misma consulta sirve
// para los dos casos.

const COLUMN_FIELDS = `
  id, name, position,
  created_at AS "createdAt", updated_at AS "updatedAt"`;

const CARD_FIELDS = `
  id, column_id AS "columnId", title, description, priority,
  due_date AS "dueDate", completed, position, created_at AS "createdAt", updated_at AS "updatedAt"`;

/* ---------- Columnas ---------- */

async function findColumn(db, id) {
  const { rows } = await db.query(`SELECT ${COLUMN_FIELDS} FROM kanban_columns WHERE id = $1`, [id]);
  return rows[0] || null;
}

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

async function insertColumn(db, { name }, position) {
  const { rows } = await db.query(
    `INSERT INTO kanban_columns (name, position)
     VALUES ($1, $2)
     RETURNING ${COLUMN_FIELDS}`,
    [name, position]
  );
  return rows[0];
}

async function updateColumn(db, id, { name }) {
  const { rows } = await db.query(
    `UPDATE kanban_columns SET name = $1 WHERE id = $2 RETURNING ${COLUMN_FIELDS}`,
    [name, id]
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

// `completed` solo viene en las copias (duplicar); una tarjeta nueva empieza sin completar.
async function insertCard(db, columnId, { title, description, priority, dueDate, completed = false }, position) {
  const { rows } = await db.query(
    `INSERT INTO kanban_cards (column_id, title, description, priority, due_date, completed, position)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${CARD_FIELDS}`,
    [columnId, title, description, priority, dueDate, completed, position]
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

async function updateCardCompleted(db, id, completed) {
  const { rows } = await db.query(
    `UPDATE kanban_cards SET completed = $1 WHERE id = $2 RETURNING ${CARD_FIELDS}`,
    [completed, id]
  );
  return rows[0] || null;
}

async function deleteCard(db, id) {
  await db.query('DELETE FROM kanban_cards WHERE id = $1', [id]);
}

// Copia las tarjetas de una columna al final de otra (vacía), conservando su orden.
// INSERT ... SELECT hace la copia en una sola consulta, sin pasar los datos por JavaScript.
async function copyCards(db, sourceColumnId, targetColumnId) {
  await db.query(
    `INSERT INTO kanban_cards (column_id, title, description, priority, due_date, completed, position)
     SELECT $2, title, description, priority, due_date, completed, position
     FROM kanban_cards WHERE column_id = $1
     ORDER BY position, id`,
    [sourceColumnId, targetColumnId]
  );
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

/* ---------- Proyecto (título y descripción del tablero) ---------- */

// Sin fila guardada (base creada antes de esta función) se devuelven los valores vacíos.
async function findProject(db) {
  const { rows } = await db.query('SELECT name, description FROM kanban_project WHERE id = 1');
  return rows[0] || { name: '', description: '' };
}

// Inserta la fila única o, si ya existe, la actualiza (UPSERT).
async function saveProject(db, { name, description }) {
  const { rows } = await db.query(
    `INSERT INTO kanban_project (id, name, description) VALUES (1, $1, $2)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description
     RETURNING name, description`,
    [name, description]
  );
  return rows[0];
}

module.exports = {
  findColumn,
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
  updateCardCompleted,
  deleteCard,
  copyCards,
  deleteCardsOfColumn,
  saveCardOrder,
  findProject,
  saveProject,
};
