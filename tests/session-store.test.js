// Pruebas del adaptador de sessionStorage (modo invitado).
// Ejecutan el módulo REAL del navegador (public/js/store/sessionStore.js) en Node,
// sustituyendo sessionStorage por uno de mentira. No usan red ni base de datos.
// Lo que no cubren: el comportamiento de un navegador real (ver README, limitaciones).

const { describe, test, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { FakeStorage, installStorage } = require('./helpers/fakeStorage');

let store;
let guest;
let storage;

before(async () => {
  store = await import('../public/js/store/sessionStore.js');
  guest = await import('../public/js/guest.js');
});

beforeEach(() => {
  storage = new FakeStorage();
  installStorage(storage);
});

const titles = (result) => result.data.map((task) => task.title);

async function assertRejects(promise, check) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.name, 'StoreError');
    check(error);
    return true;
  });
}

async function seedList() {
  await store.createTask({ title: 'Alfa informe', status: 'pending', priority: 'low', dueDate: '2026-12-10' });
  await store.createTask({ title: 'Beta', description: 'Enviar INFORME mensual', status: 'in_progress', priority: 'high', dueDate: '2026-12-01' });
  await store.createTask({ title: 'Gamma 100% listo', status: 'completed', priority: 'medium' });
  await store.createTask({ title: 'Delta', status: 'pending', priority: 'high', dueDate: '2026-12-05' });
}

describe('CRUD en sessionStorage', () => {
  test('una sesión nueva empieza sin tareas', async () => {
    assert.deepEqual(await store.listTasks(), {
      data: [],
      meta: { total: 0, countsByStatus: { pending: 0, in_progress: 0, completed: 0 } },
    });
  });

  test('crea una tarea con valores por defecto, id único y fechas', async () => {
    const task = await store.createTask({ title: '  Comprar pan  ' });
    assert.equal(task.title, 'Comprar pan');
    assert.equal(task.description, null);
    assert.equal(task.status, 'pending');
    assert.equal(task.priority, 'medium');
    assert.equal(task.dueDate, null);
    assert.equal(typeof task.id, 'string');
    assert.ok(!Number.isNaN(Date.parse(task.createdAt)));
    assert.equal(task.updatedAt, task.createdAt);

    const other = await store.createTask({ title: 'Otra' });
    assert.notEqual(other.id, task.id);
  });

  test('la tarea queda guardada en sessionStorage bajo la clave de TaskFlow', async () => {
    const task = await store.createTask({ title: 'Persistente', priority: 'high', dueDate: '2026-12-24' });
    assert.deepEqual([...storage.items.keys()], [store.TASKS_KEY]);
    assert.deepEqual(JSON.parse(storage.getItem(store.TASKS_KEY)), [task]);
  });

  test('getTask devuelve la tarea y falla con 404 si no existe', async () => {
    const task = await store.createTask({ title: 'Consultar' });
    assert.deepEqual(await store.getTask(task.id), task);
    await assertRejects(store.getTask('no-existe'), (error) => {
      assert.equal(error.status, 404);
      assert.equal(error.message, 'Tarea no encontrada');
    });
  });

  test('updateTask reemplaza todos los campos y conserva id y fecha de creación', async () => {
    const created = await store.createTask({ title: 'Antes', description: 'texto', dueDate: '2026-12-01' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const updated = await store.updateTask(created.id, { title: 'Después', status: 'in_progress', priority: 'low' });

    assert.equal(updated.id, created.id);
    assert.equal(updated.title, 'Después');
    assert.equal(updated.status, 'in_progress');
    assert.equal(updated.priority, 'low');
    assert.equal(updated.description, null);
    assert.equal(updated.dueDate, null);
    assert.equal(updated.createdAt, created.createdAt);
    assert.ok(updated.updatedAt > created.updatedAt);
    assert.deepEqual(await store.getTask(created.id), updated);
  });

  test('updateTaskStatus cambia solo el estado', async () => {
    const created = await store.createTask({ title: 'Estado', priority: 'high' });
    const updated = await store.updateTaskStatus(created.id, 'completed');
    assert.equal(updated.status, 'completed');
    assert.equal(updated.priority, 'high');
    assert.equal(updated.title, 'Estado');
  });

  test('deleteTask elimina la tarea y después ya no existe', async () => {
    const keep = await store.createTask({ title: 'Se queda' });
    const gone = await store.createTask({ title: 'Se va' });
    assert.equal(await store.deleteTask(gone.id), null);
    assert.deepEqual(titles(await store.listTasks()), ['Se queda']);
    await assertRejects(store.deleteTask(gone.id), (error) => assert.equal(error.status, 404));
    assert.ok(await store.getTask(keep.id));
  });

  test('actualizar o cambiar el estado de un id inexistente da 404', async () => {
    await assertRejects(store.updateTask('x', { title: 'A' }), (error) => assert.equal(error.status, 404));
    await assertRejects(store.updateTaskStatus('x', 'completed'), (error) => assert.equal(error.status, 404));
  });
});

describe('Validación en sessionStorage', () => {
  test('rechaza título vacío y no guarda nada', async () => {
    await assertRejects(store.createTask({ title: '   ' }), (error) => {
      assert.equal(error.status, 400);
      assert.deepEqual(error.details, [{ field: 'title', message: 'El título es obligatorio' }]);
    });
    assert.equal(storage.length, 0);
  });

  test('acumula errores de fecha, estado y prioridad', async () => {
    await assertRejects(
      store.createTask({ title: 'A', dueDate: '2026-02-30', status: 'done', priority: 'urgent' }),
      (error) => assert.deepEqual(error.details.map((d) => d.field).sort(), ['dueDate', 'priority', 'status'])
    );
  });

  test('rechaza un estado inválido al cambiar el estado y deja la tarea como estaba', async () => {
    const task = await store.createTask({ title: 'A' });
    await assertRejects(store.updateTaskStatus(task.id, 'archived'), (error) => assert.equal(error.status, 400));
    assert.equal((await store.getTask(task.id)).status, 'pending');
  });

  test('guarda como texto literal un título con HTML', async () => {
    const title = '<img src=x onerror=alert(1)>';
    const task = await store.createTask({ title });
    assert.equal((await store.getTask(task.id)).title, title);
  });
});

describe('Filtros, búsqueda, orden y estadísticas en sessionStorage', () => {
  beforeEach(seedList);

  test('por defecto ordena de más reciente a más antigua e incluye recuentos', async () => {
    const result = await store.listTasks();
    assert.deepEqual(titles(result), ['Delta', 'Gamma 100% listo', 'Beta', 'Alfa informe']);
    assert.deepEqual(result.meta, { total: 4, countsByStatus: { pending: 2, in_progress: 1, completed: 1 } });
  });

  test('filtra por estado, por prioridad y por ambos', async () => {
    assert.deepEqual(titles(await store.listTasks({ status: 'pending' })), ['Delta', 'Alfa informe']);
    assert.deepEqual(titles(await store.listTasks({ priority: 'high' })), ['Delta', 'Beta']);
    assert.deepEqual(titles(await store.listTasks({ status: 'pending', priority: 'high' })), ['Delta']);
  });

  test('los recuentos son globales aunque haya filtros', async () => {
    const result = await store.listTasks({ status: 'completed' });
    assert.equal(result.meta.total, 1);
    assert.deepEqual(result.meta.countsByStatus, { pending: 2, in_progress: 1, completed: 1 });
  });

  test('busca en título y descripción sin distinguir mayúsculas', async () => {
    assert.deepEqual(titles(await store.listTasks({ q: 'informe' })), ['Beta', 'Alfa informe']);
    assert.deepEqual(titles(await store.listTasks({ q: '100%' })), ['Gamma 100% listo']);
    assert.deepEqual(titles(await store.listTasks({ q: '_' })), []);
  });

  test('ordena por fecha límite dejando al final las tareas sin fecha', async () => {
    assert.deepEqual(
      titles(await store.listTasks({ sort: 'due_date', order: 'asc' })),
      ['Beta', 'Delta', 'Alfa informe', 'Gamma 100% listo']
    );
    assert.deepEqual(
      titles(await store.listTasks({ sort: 'due_date', order: 'desc' })),
      ['Alfa informe', 'Delta', 'Beta', 'Gamma 100% listo']
    );
  });

  test('ordena por prioridad', async () => {
    assert.deepEqual(
      titles(await store.listTasks({ sort: 'priority', order: 'desc' })),
      ['Delta', 'Beta', 'Gamma 100% listo', 'Alfa informe']
    );
    assert.deepEqual(
      titles(await store.listTasks({ sort: 'priority', order: 'asc' })),
      ['Alfa informe', 'Gamma 100% listo', 'Delta', 'Beta']
    );
  });

  test('rechaza filtros y órdenes no permitidos', async () => {
    for (const filters of [{ status: 'done' }, { priority: 'urgent' }, { sort: 'title' }, { order: 'up' }]) {
      await assertRejects(store.listTasks(filters), (error) => assert.equal(error.status, 400));
    }
  });
});

describe('Persistencia y salida del modo invitado', () => {
  test('los datos sobreviven a una recarga (el módulo no guarda copia en memoria)', async () => {
    await seedList();
    // Una recarga vuelve a ejecutar el código con el mismo sessionStorage:
    // se simula importando una copia nueva del módulo.
    const reloaded = await import('../public/js/store/sessionStore.js?recarga');
    assert.notEqual(reloaded, store);
    assert.deepEqual(titles(await reloaded.listTasks()), ['Delta', 'Gamma 100% listo', 'Beta', 'Alfa informe']);
  });

  test('clearAll borra las tareas de TaskFlow y no toca otros datos del mismo origen', async () => {
    storage.setItem('otra-aplicacion', 'no tocar');
    await seedList();
    guest.startGuest();

    await store.clearAll();
    guest.endGuest();

    assert.deepEqual([...storage.items.entries()], [['otra-aplicacion', 'no tocar']]);
    assert.deepEqual((await store.listTasks()).data, []);
  });

  test('el indicador de invitado se activa al entrar y se apaga al salir', () => {
    assert.equal(guest.isGuestActive(), false);
    guest.startGuest();
    assert.equal(guest.isGuestActive(), true);
    assert.equal(storage.getItem(guest.GUEST_KEY), '1');
    guest.endGuest();
    assert.equal(guest.isGuestActive(), false);
  });
});

describe('Errores de almacenamiento', () => {
  test('almacenamiento bloqueado: error claro en lecturas y escrituras', async () => {
    installStorage(() => {
      throw new Error('SecurityError');
    });
    await assertRejects(store.listTasks(), (error) => assert.match(error.message, /no permite guardar/));
    await assertRejects(store.createTask({ title: 'A' }), (error) => assert.match(error.message, /no permite guardar/));
    assert.equal(guest.isGuestActive(), false);
    assert.throws(() => guest.startGuest(), /no permite guardar/);
  });

  test('sin espacio: avisa y conserva las tareas que ya había', async () => {
    const first = await store.createTask({ title: 'Ya guardada' });
    storage.setItem = () => {
      const error = new Error('quota');
      error.name = 'QuotaExceededError';
      throw error;
    };
    await assertRejects(store.createTask({ title: 'No cabe' }), (error) => assert.match(error.message, /No queda espacio/));
    assert.deepEqual((await store.listTasks()).data, [first]);
  });

  test('datos dañados: avisa sin borrar nada y permite empezar de nuevo con clearAll', async () => {
    for (const corrupt of ['{esto no es JSON', '{"no":"es una lista"}', '[{"id":1}]', '[null]']) {
      storage.setItem(store.TASKS_KEY, corrupt);
      await assertRejects(store.listTasks(), (error) => assert.match(error.message, /dañados/));
      await assertRejects(store.createTask({ title: 'A' }), (error) => assert.match(error.message, /dañados/));
      assert.equal(storage.getItem(store.TASKS_KEY), corrupt);
    }
    await store.clearAll();
    assert.deepEqual((await store.listTasks()).data, []);
  });
});
