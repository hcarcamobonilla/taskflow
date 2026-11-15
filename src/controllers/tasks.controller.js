// Controladores: reciben la petición HTTP, validan la entrada, llaman al repositorio
// y devuelven la respuesta JSON. Express 5 envía al manejador de errores cualquier
// error lanzado (o promesa rechazada) dentro de estas funciones async.

const repository = require('../repositories/tasks.repository');
const validator = require('../validators/tasks.validator');
const HttpError = require('../utils/HttpError');

function notFound() {
  return new HttpError(404, 'Tarea no encontrada');
}

async function list(req, res) {
  const filters = validator.validateListQuery(req.query);
  const [tasks, countsByStatus] = await Promise.all([
    repository.findAll(filters),
    repository.countByStatus(),
  ]);
  // countsByStatus cuenta TODAS las tareas (para el dashboard); total cuenta las filtradas.
  res.json({ data: tasks, meta: { total: tasks.length, countsByStatus } });
}

async function getOne(req, res) {
  const id = validator.parseId(req.params.id);
  const task = await repository.findById(id);
  if (!task) throw notFound();
  res.json({ data: task });
}

async function create(req, res) {
  const input = validator.validateTask(req.body);
  const task = await repository.create(input);
  res.status(201).location(`/api/tasks/${task.id}`).json({ data: task });
}

async function update(req, res) {
  const id = validator.parseId(req.params.id);
  const input = validator.validateTask(req.body);
  const task = await repository.update(id, input);
  if (!task) throw notFound();
  res.json({ data: task });
}

async function updateStatus(req, res) {
  const id = validator.parseId(req.params.id);
  const status = validator.validateStatus(req.body);
  const task = await repository.updateStatus(id, status);
  if (!task) throw notFound();
  res.json({ data: task });
}

async function remove(req, res) {
  const id = validator.parseId(req.params.id);
  const deleted = await repository.remove(id);
  if (!deleted) throw notFound();
  res.status(204).end();
}

module.exports = { list, getOne, create, update, updateStatus, remove };
