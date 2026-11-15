// Acceso a datos: todas las consultas SQL de la tabla tasks.
// Los valores del usuario viajan SIEMPRE como parámetros ($1, $2...), nunca concatenados.

const pool = require('../db/pool');

// Columnas devueltas al cliente, con alias en camelCase para el JSON.
const COLUMNS = `
  id, title, description, status, priority,
  due_date AS "dueDate", created_at AS "createdAt", updated_at AS "updatedAt"`;

// Expresiones de orden permitidas. La clave viene validada por el validador (lista blanca),
// así que solo se inserta en el SQL texto definido aquí, nunca texto del usuario.
const SORT_SQL = {
  created_at: 'created_at',
  due_date: 'due_date',
  priority: "CASE priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END",
};

// En ILIKE, % y _ son comodines: se escapan para buscar el texto literal.
function escapeLike(text) {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

async function findAll({ status, priority, q, sort = 'created_at', order = 'desc' } = {}) {
  const conditions = [];
  const params = [];

  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  if (priority) {
    params.push(priority);
    conditions.push(`priority = $${params.length}`);
  }
  if (q) {
    params.push(`%${escapeLike(q)}%`);
    conditions.push(`(title ILIKE $${params.length} OR description ILIKE $${params.length})`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const direction = order === 'asc' ? 'ASC' : 'DESC';
  const orderBy = `${SORT_SQL[sort] || SORT_SQL.created_at} ${direction} NULLS LAST, id DESC`;

  const { rows } = await pool.query(`SELECT ${COLUMNS} FROM tasks ${where} ORDER BY ${orderBy}`, params);
  return rows;
}

async function countByStatus() {
  const { rows } = await pool.query(
    'SELECT status, COUNT(*)::int AS count FROM tasks GROUP BY status'
  );
  const counts = { pending: 0, in_progress: 0, completed: 0 };
  for (const row of rows) counts[row.status] = row.count;
  return counts;
}

async function findById(id) {
  const { rows } = await pool.query(`SELECT ${COLUMNS} FROM tasks WHERE id = $1`, [id]);
  return rows[0] || null;
}

async function create({ title, description, status, priority, dueDate }) {
  const { rows } = await pool.query(
    `INSERT INTO tasks (title, description, status, priority, due_date)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${COLUMNS}`,
    [title, description, status, priority, dueDate]
  );
  return rows[0];
}

async function update(id, { title, description, status, priority, dueDate }) {
  const { rows } = await pool.query(
    `UPDATE tasks
     SET title = $1, description = $2, status = $3, priority = $4, due_date = $5
     WHERE id = $6
     RETURNING ${COLUMNS}`,
    [title, description, status, priority, dueDate, id]
  );
  return rows[0] || null;
}

async function updateStatus(id, status) {
  const { rows } = await pool.query(
    `UPDATE tasks SET status = $1 WHERE id = $2 RETURNING ${COLUMNS}`,
    [status, id]
  );
  return rows[0] || null;
}

async function remove(id) {
  const { rowCount } = await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
  return rowCount > 0;
}

module.exports = { findAll, countByStatus, findById, create, update, updateStatus, remove };
