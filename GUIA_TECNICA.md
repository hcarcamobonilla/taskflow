# Guía técnica de TaskFlow

Este documento explica cómo funciona TaskFlow por dentro para que puedas entenderlo, modificarlo
y defenderlo en una entrevista. Las referencias `archivo:línea` apuntan al código real; si
editas un archivo, los números pueden desplazarse (busca entonces por el nombre de la función).

## 1. Flujo completo: navegador → API → PostgreSQL

Ejemplo: el usuario crea una tarea.

1. **Navegador.** El usuario envía el formulario. `handleSubmit` (`public/js/main.js:42`) lee
   los campos con `ui.readForm()` y llama a `api.createTask(task)`.
2. **Fetch.** `request` (`public/js/api.js:15`) envía `POST /api/tasks` con el cuerpo en JSON.
3. **Express.** `express.json()` (`src/app.js:13`) convierte el cuerpo en un objeto
   `req.body`. El router (`src/routes/tasks.routes.js:10`) asocia `POST /` con `controller.create`.
4. **Controlador.** `create` (`src/controllers/tasks.controller.js:30`) pide al validador que
   revise los datos y, si son correctos, llama al repositorio.
5. **Validador.** `validateTask` (`src/validators/tasks.validator.js:45`) devuelve los datos
   limpios o lanza un `HttpError` 400 con el detalle de cada campo.
6. **Repositorio.** `create` (`src/repositories/tasks.repository.js:63`) ejecuta un `INSERT`
   parametrizado a través del pool de conexiones (`src/db/pool.js:11`).
7. **PostgreSQL** guarda la fila, aplica sus restricciones (`db/schema.sql`) y devuelve la
   fila creada gracias a `RETURNING`.
8. **Respuesta.** El controlador responde `201` con `{ data: tarea }`. De vuelta en el
   navegador, `main.js` muestra un mensaje y llama a `loadTasks()` para repintar la lista y el
   dashboard.

Si algo falla en los pasos 4 a 7, el error llega al manejador central
(`src/middleware/errorHandler.js:43`), que lo convierte en una respuesta JSON con el código
HTTP adecuado.

## 2. Responsabilidad de cada tecnología

| Tecnología | Para qué se usa aquí |
|------------|----------------------|
| HTML | Estructura y significado de la página: formularios, encabezados, lista, regiones `aria-live` |
| CSS | Presentación y diseño responsive (una columna en móvil, rejilla desde 640px) |
| JavaScript (navegador) | Reaccionar a eventos, llamar a la API con `fetch` y actualizar el DOM |
| Node.js | Ejecutar JavaScript en el servidor |
| Express | Servidor HTTP: rutas, lectura de JSON, archivos estáticos y middleware de errores |
| `pg` | Enviar consultas SQL a PostgreSQL desde Node y gestionar el pool de conexiones |
| PostgreSQL | Guardar los datos de forma persistente y garantizar su integridad con restricciones |
| `node:test` + `supertest` | Pruebas automatizadas; `supertest` envía peticiones HTTP a la app sin abrir un puerto |

## 3. Organización del código

### Backend (`src/`)

| Archivo | Responsabilidad |
|---------|-----------------|
| `server.js` | Arranca el servidor (`listen`) y cierra el pool al recibir `SIGINT`/`SIGTERM` |
| `app.js` | Crea la app Express: JSON, estáticos, rutas y manejo de errores. No hace `listen`, por eso las pruebas pueden usarla |
| `config.js` | Lee variables de entorno. Elige la base de pruebas cuando `NODE_ENV=test` (`src/config.js:12`) |
| `db/pool.js` | Único pool de conexiones de la aplicación |
| `routes/tasks.routes.js` | Tabla de rutas: método + URL → función del controlador |
| `controllers/tasks.controller.js` | Orquesta cada petición: validar, llamar al repositorio, responder |
| `validators/tasks.validator.js` | Reglas de validación; no conoce Express ni la base de datos |
| `repositories/tasks.repository.js` | Todo el SQL; no conoce HTTP |
| `middleware/errorHandler.js` | Traduce cualquier error a una respuesta JSON uniforme |
| `utils/HttpError.js` | Clase de error que lleva un código HTTP |

No hay una capa de "servicios" separada porque la lógica de negocio es mínima: añadirla habría
sido una abstracción sin contenido.

### Frontend (`public/js/`)

| Archivo | Responsabilidad |
|---------|-----------------|
| `api.js` | Única parte que usa `fetch`. Convierte las respuestas de error en `ApiError` |
| `ui.js` | Única parte que toca el DOM: pintar lista, dashboard, mensajes y formulario |
| `main.js` | Conecta eventos con `api.js` y `ui.js`; guarda el estado mínimo (`editingId`) |

## 4. Base de datos

Tabla `tasks` (`db/schema.sql`):

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | `INTEGER GENERATED ALWAYS AS IDENTITY` | Clave primaria autogenerada |
| `title` | `VARCHAR(150) NOT NULL` | `CHECK` impide títulos vacíos o solo con espacios |
| `description` | `TEXT` | Opcional, máximo 2000 caracteres |
| `status` | `TEXT` | `CHECK`: `pending`, `in_progress`, `completed`. Por defecto `pending` |
| `priority` | `TEXT` | `CHECK`: `low`, `medium`, `high`. Por defecto `medium` |
| `due_date` | `DATE` | Opcional |
| `created_at`, `updated_at` | `TIMESTAMPTZ` | Por defecto `now()`; un trigger actualiza `updated_at` en cada `UPDATE` |

Las reglas se validan dos veces: en el servidor Node (mensajes claros para el usuario) y en la
base de datos (última línea de defensa, aunque alguien inserte datos por otra vía).

### Principales consultas SQL

Todas están en `src/repositories/tasks.repository.js`.

**Listar con filtros** (`findAll`, línea 24). El `WHERE` se construye solo con las condiciones
necesarias, y cada valor va en el arreglo de parámetros:

```sql
SELECT id, title, description, status, priority,
       due_date AS "dueDate", created_at AS "createdAt", updated_at AS "updatedAt"
FROM tasks
WHERE status = $1 AND priority = $2 AND (title ILIKE $3 OR description ILIKE $3)
ORDER BY created_at DESC NULLS LAST, id DESC
```

**Ordenar por prioridad.** Alfabéticamente `high < low < medium`, que no sirve; por eso se
convierte a número (`SORT_SQL`, línea 13):

```sql
ORDER BY CASE priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC
```

**Recuentos del dashboard** (`countByStatus`, línea 49):

```sql
SELECT status, COUNT(*)::int AS count FROM tasks GROUP BY status
```

**Crear** (línea 63), **actualizar** (línea 73), **cambiar estado** (línea 84) y **eliminar** (línea 92):

```sql
INSERT INTO tasks (title, description, status, priority, due_date)
VALUES ($1, $2, $3, $4, $5) RETURNING ...;

UPDATE tasks SET title = $1, description = $2, status = $3, priority = $4, due_date = $5
WHERE id = $6 RETURNING ...;

UPDATE tasks SET status = $1 WHERE id = $2 RETURNING ...;

DELETE FROM tasks WHERE id = $1;
```

`RETURNING` devuelve la fila resultante en la misma consulta, así no hace falta un `SELECT`
adicional. Si `UPDATE` no devuelve filas o `DELETE` afecta a 0 filas, el id no existía y el
controlador responde `404`.

## 5. CRUD: qué hace cada endpoint

| Operación | Endpoint | Controlador | Éxito |
|-----------|----------|-------------|-------|
| Listar | `GET /api/tasks` | `list` (línea 13) | `200` con `data` y `meta` |
| Consultar | `GET /api/tasks/:id` | `getOne` (línea 23) | `200` |
| Crear | `POST /api/tasks` | `create` (línea 30) | `201` + cabecera `Location` |
| Editar | `PUT /api/tasks/:id` | `update` (línea 36) | `200` |
| Cambiar estado | `PATCH /api/tasks/:id/status` | `updateStatus` (línea 44) | `200` |
| Eliminar | `DELETE /api/tasks/:id` | `remove` (línea 52) | `204` sin cuerpo |

`PUT` reemplaza la tarea completa (lo que no se envía vuelve a su valor por defecto) y `PATCH`
modifica solo una parte (el estado). Esa es la diferencia habitual entre ambos métodos.

## 6. Validaciones

Todas en `src/validators/tasks.validator.js`:

| Dato | Regla | Función |
|------|-------|---------|
| `id` | Solo dígitos, entre 1 y 2147483647 (máximo de `INTEGER`) | `parseId` (línea 20) |
| `title` | Texto, obligatorio, no solo espacios, máximo 150 | `validateTask` (línea 45) |
| `description` | Texto opcional, máximo 2000 | `validateTask` |
| `status`, `priority` | Deben estar en su lista de valores permitidos | `validateTask`, `validateStatus` (línea 99) |
| `dueDate` | Formato `YYYY-MM-DD` y fecha real (rechaza `2026-02-30`) | `isValidDate` (línea 29) |
| `sort`, `order`, filtros | Listas blancas | `validateListQuery` (línea 107) |

`validateTask` acumula todos los errores y los devuelve juntos, para que el usuario los corrija
de una vez. El navegador también comprueba el título vacío (`public/js/main.js:49`), pero solo
por comodidad: la validación que cuenta es la del servidor, porque cualquiera puede llamar a la
API sin pasar por la página.

## 7. Manejo de errores

Formato único: `{ "error": { "message": "...", "details": [...] } }`.

| Situación | Código | Dónde se decide |
|-----------|--------|-----------------|
| Validación fallida | 400 | `HttpError` lanzado por el validador |
| JSON malformado | 400 | `errorHandler.js:29` |
| Tarea inexistente | 404 | `throw notFound()` en el controlador |
| Ruta `/api` desconocida | 404 | `apiNotFound` (`errorHandler.js:8`) |
| PostgreSQL caído | 503 | `isDatabaseDown` (`errorHandler.js:16`) |
| Cualquier otro error | 500 | `errorHandler.js:38`, con mensaje genérico |

Los errores 5xx se registran en la consola del servidor, pero al cliente nunca se le envía la
traza ni el mensaje original.

### Errores frecuentes al trabajar con el proyecto

| Síntoma | Causa probable | Solución |
|---------|----------------|----------|
| La página dice "La base de datos no está disponible" | PostgreSQL detenido (típico tras reiniciar WSL) | `sudo service postgresql start` |
| `password authentication failed for user "taskflow"` | La contraseña de `.env` no coincide con la del rol | `sudo -u postgres psql -c "\password taskflow"` y usar la misma en `.env` |
| `database "taskflow" does not exist` o `relation "tasks" does not exist` | Falta preparar la base | `npm run db:setup` |
| `node: command not found` o `which node` muestra `/mnt/c/...` | nvm no está cargado en esa terminal | Abrir una terminal nueva o ejecutar `nvm use` |
| `EADDRINUSE :::3000` | Ya hay un servidor en ese puerto | Detenerlo o cambiar `PORT` en `.env` |
| `node: .env: not found` | No existe `.env` | `cp .env.example .env` y completar la contraseña |

## 8. Decisiones de diseño

- **SQL directo con `pg`, sin ORM.** Con una sola tabla, el SQL se lee completo y se aprende más.
- **`TEXT` + `CHECK` en lugar de tipos `ENUM`.** Es más fácil de leer y de modificar.
- **Trigger para `updated_at`.** La fecha se actualiza aunque el cambio no pase por la aplicación.
- **Recuentos dentro de `GET /api/tasks`.** El dashboard se actualiza con la misma petición que
  la lista, sin añadir otro endpoint. Los recuentos son globales; `meta.total` es el número de
  tareas filtradas.
- **Fechas `DATE` como texto.** `pg` convertiría `DATE` en un objeto `Date` con hora local, lo
  que puede cambiar el día al pasar a JSON. Se desactiva esa conversión (`src/db/pool.js:9`).
- **Sin `dotenv` ni `nodemon`.** Node ya incluye `--env-file` y `--watch`.
- **Base de datos separada para pruebas.** `resetTasks` (`tests/helpers/db.js`) vacía la tabla
  antes de cada prueba y se niega a ejecutarse si no está en la base de pruebas.
- **`confirm()` nativo para eliminar.** Es accesible por teclado y por lectores de pantalla sin
  escribir código adicional.
- **Recargar la lista después de cada cambio.** Es más simple que actualizar el DOM a mano y
  garantiza que la pantalla muestra lo que realmente hay en la base de datos.

## 9. Seguridad y accesibilidad

- **Inyección SQL.** Los valores del usuario viajan siempre como parámetros (`$1`, `$2`…). Lo
  único que se inserta como texto en el SQL es la expresión de orden, que sale de un objeto
  fijo (`SORT_SQL`) y nunca de la entrada del usuario.
- **XSS.** El frontend crea elementos con `createElement` y escribe con `textContent`
  (`public/js/ui.js:20`); no usa `innerHTML`. Un título como `<img onerror=...>` se muestra
  como texto.
- **Secretos.** Las credenciales están en `.env`, excluido del repositorio por `.gitignore`.
- **Accesibilidad.** Cada control tiene su `<label>`; los mensajes usan `role="status"` y
  `aria-live`; los campos con error reciben `aria-invalid` y el foco; hay enlace para saltar a
  la lista; el foco es siempre visible; tras eliminar o cambiar un estado el foco vuelve a un
  lugar lógico.

## 10. Preguntas de entrevista

Cada respuesta puede comprobarse en el código indicado.

**1. ¿Cómo evitas la inyección SQL?**
Con consultas parametrizadas: el texto SQL y los valores viajan por separado, así que
PostgreSQL nunca interpreta un valor como código. Ver `src/repositories/tasks.repository.js:29-38`
y `:63-70`. Hay una prueba que guarda `x'); DROP TABLE tasks; --` como título y comprueba que
se almacena tal cual (`tests/tasks.api.test.js:69`).

**2. El orden (`ORDER BY`) no se puede parametrizar. ¿Cómo lo resuelves sin riesgo?**
Con una lista blanca. El validador solo acepta `created_at`, `due_date` o `priority`
(`src/validators/tasks.validator.js:8`) y el repositorio traduce esa clave a un fragmento de
SQL escrito por mí (`SORT_SQL`, `src/repositories/tasks.repository.js:13`). El texto del
usuario nunca llega al SQL.

**3. ¿Por qué separaste rutas, controladores, validadores y repositorio?**
Para que cada archivo tenga un solo motivo para cambiar. El repositorio no sabe nada de HTTP y
el validador no sabe nada de la base de datos, por eso el validador se prueba sin PostgreSQL
(`tests/validator.test.js`).

**4. ¿Qué diferencia hay entre `PUT` y `PATCH` en tu API?**
`PUT /api/tasks/:id` reemplaza todos los campos editables (`update`,
`src/controllers/tasks.controller.js:36`). `PATCH /api/tasks/:id/status` cambia solo el estado
(`updateStatus`, línea 44) y ejecuta un `UPDATE` de una sola columna
(`src/repositories/tasks.repository.js:86`).

**5. ¿Qué códigos HTTP devuelves y por qué?**
`200` lectura o actualización correcta, `201` recurso creado (con cabecera `Location`,
`tasks.controller.js:33`), `204` eliminado sin cuerpo (línea 56), `400` entrada no válida,
`404` no existe, `503` base de datos no disponible y `500` error inesperado
(`src/middleware/errorHandler.js:24-39`).

**6. ¿Cómo funciona el manejo centralizado de errores?**
Los controladores no usan `try/catch`: lanzan errores. Express 5 envía automáticamente al
middleware de errores cualquier excepción o promesa rechazada de un controlador `async`. Ese
middleware (`errorHandler.js:43`), registrado al final (`src/app.js:24`), decide el código y el
mensaje.

**7. ¿Por qué validas en el servidor si el formulario ya valida?**
Porque la validación del navegador se puede saltar llamando a la API directamente (por ejemplo
con `curl`). La del navegador mejora la experiencia; la del servidor protege los datos. Además
la base de datos tiene restricciones `CHECK` como última barrera (`db/schema.sql:5-10`).

**8. ¿Cómo validas una fecha?**
`isValidDate` (`src/validators/tasks.validator.js:29`) exige el formato `YYYY-MM-DD` con una
expresión regular y luego construye la fecha y comprueba que año, mes y día no cambiaron. Así
se rechaza `2026-02-30`, que JavaScript convertiría silenciosamente en el 2 de marzo.

**9. ¿Qué es un pool de conexiones y por qué lo usas?**
Abrir una conexión a PostgreSQL es costoso. El pool (`src/db/pool.js:11`) mantiene hasta 10
conexiones abiertas y las reutiliza entre peticiones. `pool.query` toma una conexión, ejecuta
la consulta y la devuelve al pool.

**10. ¿Cómo evitas XSS en el frontend?**
No uso `innerHTML`. Los elementos se crean con `document.createElement` y el texto se asigna
con `textContent` (función `el`, `public/js/ui.js:17`), que nunca interpreta HTML.

**11. ¿Qué pasa si PostgreSQL se cae mientras la aplicación está en marcha?**
La consulta falla con un error de conexión, `isDatabaseDown` lo reconoce
(`errorHandler.js:16`) y la API responde `503` con un mensaje genérico. El frontend lo muestra
en la zona de mensajes. Está probado apuntando la conexión a un puerto sin servicio
(`tests/db-down.test.js`).

**12. ¿Tus pruebas usan una base de datos real o simulada?**
Real. `supertest` envía peticiones HTTP a la app y esta consulta PostgreSQL en la base
`taskflow_test`. Algunas pruebas además consultan la tabla directamente para confirmar que el
dato se guardó (`tests/tasks.api.test.js`, primera prueba de `POST`). Las de
`tests/validator.test.js` son unitarias y no usan base de datos.

**13. ¿Cómo evitas que las pruebas borren los datos de desarrollo?**
El script de pruebas define `NODE_ENV=test` (`package.json`) y `config.js:12` elige entonces
`PGDATABASE_TEST`. Además `resetTasks` lanza un error si no está conectada a la base de pruebas
(`tests/helpers/db.js:8-10`).

**14. Si el usuario escribe rápido en el buscador, ¿cómo evitas resultados desordenados?**
Con dos medidas en `public/js/main.js`: un *debounce* de 300 ms (línea 135) para no enviar una
petición por cada tecla, y un contador `lastLoadId` (líneas 14 y 23-38) para descartar la
respuesta de una petición antigua si llega después de una más reciente.

**15. ¿Por qué `app.js` y `server.js` están separados?**
`app.js` construye la aplicación sin abrir ningún puerto (`createApp`, `src/app.js:9`), y
`server.js` hace el `listen`. Así las pruebas importan la app y `supertest` la usa directamente,
sin arrancar un servidor ni ocupar el puerto 3000.

### Qué todavía no cubre el proyecto

Conviene decirlo con naturalidad si lo preguntan: no hay autenticación ni usuarios, paginación,
migraciones versionadas, pruebas automatizadas en navegador, despliegue ni integración continua.
Son los siguientes pasos naturales, no cosas que el proyecto ya haga.

## 11. Cómo se desarrolló con un asistente de IA

TaskFlow se construyó con Claude Code (asistente de programación de Anthropic) trabajando en la
terminal de WSL, y conviene contarlo tal cual.

**Flujo de trabajo**

1. El propietario escribió `CLAUDE.md`: alcance, tecnologías permitidas, reglas de seguridad,
   forma de trabajo y criterio de terminado.
2. El asistente propuso un plan por etapas (estructura, instalación, comandos con `sudo`) y el
   propietario lo revisó y lo aprobó antes de que se escribiera código.
3. El asistente ejecutó cada etapa (esqueleto, base de datos, API, frontend, documentación) y
   hizo un commit por etapa solo después de verificarla.

**Verificación**

- Pruebas automatizadas con `node:test` y `supertest` contra PostgreSQL real.
- Peticiones con `curl` contra el servidor en marcha y consultas con `psql` para confirmar la
  persistencia.
- El asistente no disponía de navegador. Para comprobar el frontend ejecutó sus módulos reales
  sobre un DOM simulado (jsdom, instalado temporalmente fuera del proyecto) contra el servidor
  y la base de datos reales. La comprobación visual en un navegador real la hace el propietario.

**Decisiones humanas**

- Definir el alcance del MVP y qué tecnologías quedaban fuera (frameworks, TypeScript, ORM).
- Aprobar el plan y la estructura antes de la implementación.
- Ejecutar personalmente los comandos con `sudo` (instalar PostgreSQL y crear el rol).
- Revisar el resultado, y decidir cuándo publicar el repositorio (`git push` no lo hace el asistente).

**Cómo hablar de ello en una entrevista**

Lo honesto es decir que el código lo generó en gran parte un asistente siguiendo tus
especificaciones, y que tu trabajo fue definir requisitos, revisar, verificar y entender el
resultado. Esta guía existe para lo último: antes de presentar el proyecto, recorre el flujo de
la sección 1 con el código abierto, ejecuta las pruebas y prueba a hacer un cambio pequeño por
tu cuenta (por ejemplo, añadir un nuevo valor de prioridad en el validador, el `CHECK` del
esquema y los desplegables del HTML).
