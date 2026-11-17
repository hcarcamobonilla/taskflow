# TaskFlow — Seguimiento de tareas

Aplicación web full stack para gestionar tareas: crear, consultar, editar, eliminar, filtrar,
buscar y ordenar, con un pequeño panel de recuentos por estado. Además incluye un **tablero
Kanban** con columnas y tarjetas que se pueden reordenar. Es un proyecto de portafolio de un
solo usuario, sin cuentas ni autenticación.

## Dos versiones, un mismo código

El mismo frontend funciona de dos maneras. Lo único que cambia es dónde se guardan las tareas:

| | Versión local (full stack) | Demo web (modo invitado) |
|---|---|---|
| Para qué sirve | Desarrollo y uso real en tu equipo | Probar la aplicación desde una URL pública |
| Dónde se guardan las tareas | PostgreSQL, de forma permanente | `sessionStorage` del navegador, de forma temporal |
| Backend | Node.js + Express (API REST) | Ninguno: es un sitio estático |
| Cómo se inicia | `npm start` | `npm run build:demo` y publicar la carpeta `dist-demo/` |
| Pantalla inicial | Directamente la aplicación | Bienvenida con el botón "Entrar como invitado" |
| Quién ve las tareas | Quien use esa base de datos | Solo el visitante, en su propia pestaña |

La interfaz, los formularios y los estilos son los mismos archivos en ambas versiones.

## Funcionalidades

- CRUD completo de tareas, con confirmación antes de eliminar.
- Campos: título (obligatorio), descripción, estado (`pending`, `in_progress`, `completed`),
  prioridad (`low`, `medium`, `high`), fecha límite y fechas de creación/actualización.
- Filtro por estado y prioridad, búsqueda por texto en título y descripción, y orden por
  fecha de creación, fecha límite o prioridad.
- Dashboard con el total de tareas y el recuento por estado.
- Cambio rápido de estado desde la lista.
- Validación en el servidor y mensajes de error claros en la interfaz.
- **Tablero Kanban** como segunda vista (ver "Tablero Kanban"): columnas y tarjetas
  propias, reordenables con botones o arrastrando, con límite WIP opcional y exportación a JSON.
  Funciona en la versión local y en la demo.

## Stack tecnológico

| Capa | Tecnología |
|------|------------|
| Frontend | HTML5 semántico, CSS3 responsive, JavaScript vanilla (módulos ES) y Fetch API |
| Backend (versión local) | Node.js 26 (LTS) y Express 5 |
| Base de datos (versión local) | PostgreSQL 18 con la biblioteca `pg` (SQL parametrizado, sin ORM) |
| Almacenamiento de la demo | API Web Storage del navegador (`sessionStorage`) |
| Build de la demo | Script de Node con módulos nativos (`fs`, `path`), sin bundler |
| Pruebas | `node:test` (ejecutor nativo de Node) y `supertest` |

Dependencias de npm: solo `express` y `pg` en producción, y `supertest` para pruebas.
El archivo `.env` se carga con la opción nativa `node --env-file` (no se usa `dotenv`).

## Arquitectura

La interfaz no sabe dónde se guardan las tareas: habla con un "almacén" que tiene dos
implementaciones (adaptadores) con las mismas funciones.

```
                       ┌─ apiStore.js ──HTTP/JSON──► Express (src/) ──SQL──► PostgreSQL   (versión local)
main.js + ui.js ──► almacén
                       └─ sessionStore.js ──► sessionStorage del navegador                (demo web)
```

El adaptador se elige en `public/js/config.js` (`'api'` o `'session'`). El archivo fuente vale
`'api'`; el build de la demo genera una copia que vale `'session'`. No se detecta el entorno
automáticamente y, si la API local falla, la aplicación muestra el error: nunca cambia sola al
modo invitado.

```
seguimiento_tareas/
├── public/                 Frontend (lo sirve Express como archivos estáticos)
│   ├── index.html
│   ├── css/styles.css
│   └── js/
│       ├── config.js       Modo de almacenamiento: 'api' o 'session'
│       ├── main.js         Eventos y coordinación
│       ├── ui.js           Lectura y escritura del DOM
│       ├── guest.js        Entrada y salida del modo invitado
│       ├── view.js         Vista elegida (lista o Kanban), recordada en la pestaña
│       ├── kanban.js       Eventos del tablero y comunicación con el almacén
│       ├── kanbanUi.js     Pinta el tablero y sus diálogos en el DOM
│       ├── dropPosition.js Cálculo puro de la posición al soltar (con prueba)
│       ├── kanbanDrag.js   Arrastrar y soltar tarjetas y columnas (con ratón)
│       └── store/          Almacén de tareas y del tablero
│           ├── index.js        Carga el adaptador elegido
│           ├── apiStore.js     Adaptador HTTP (Fetch → API REST)
│           ├── apiKanban.js    Tablero: llamadas a /api/kanban (versión local)
│           ├── sessionStore.js Adaptador de sessionStorage
│           ├── sessionKanban.js Tablero en sessionStorage (demo)
│           ├── taskRules.js    Validación, filtros y orden de tareas para la demo
│           ├── kanbanRules.js  Validación y topes del tablero para la demo
│           └── StoreError.js   Error común a ambos adaptadores
├── src/                    Backend
│   ├── server.js           Arranque del servidor
│   ├── app.js              Configuración de Express
│   ├── config.js           Variables de entorno
│   ├── db/pool.js          Pool de conexiones a PostgreSQL
│   ├── routes/             URL y método → controlador
│   ├── controllers/        Petición → validación → (servicio) → respuesta
│   ├── services/           Lógica del Kanban: topes, reordenación y transacciones
│   ├── validators/         Validación de la entrada
│   ├── repositories/       Consultas SQL
│   ├── db/transaction.js   Ayudante BEGIN / COMMIT / ROLLBACK
│   ├── middleware/         Manejo centralizado de errores
│   └── utils/HttpError.js  Error con código HTTP
├── db/
│   ├── schema.sql          Tablas (tasks y Kanban), restricciones, índices y triggers
│   └── seed.sql            Datos de demostración
├── scripts/
│   ├── db-setup.js         Crea las bases de datos y aplica el esquema
│   └── build-demo.js       Genera la demo estática en dist-demo/
├── vercel.json             Configuración del despliegue de la demo
└── tests/                  Pruebas unitarias y de integración
```

## Requisitos previos (versión local)

- Windows 11 con WSL2 y Ubuntu.
- VS Code con la extensión **WSL** (opcional, pero es el entorno usado).
- Dentro de Ubuntu: `git` y `curl`.
- Node.js 22 o superior (desarrollado con 26.13.1) y PostgreSQL (desarrollado con 18.6);
  la instalación se explica abajo.

Todo se instala y se ejecuta **dentro de Ubuntu (WSL)**, no en Windows.

La demo web no necesita nada de esto para usarse: basta un navegador. Para generarla solo
hace falta Node.js (ver "Demo web").

## Instalación paso a paso (versión local)

### 1. WSL2 y VS Code

En PowerShell de Windows (como administrador), si aún no tienes WSL:

```powershell
wsl --install -d Ubuntu
```

Abre Ubuntu, clona el proyecto y ábrelo en VS Code conectado a WSL:

```bash
mkdir -p ~/proyectos && cd ~/proyectos
git clone <URL-del-repositorio> seguimiento_tareas
cd seguimiento_tareas
code .
```

### 2. Node.js con nvm

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.41.0/install.sh | bash
```

Cierra y vuelve a abrir la terminal, y después:

```bash
nvm install        # instala la versión indicada en .nvmrc
node -v
which node         # debe apuntar a ~/.nvm/..., no a /mnt/c/...
```

### 3. PostgreSQL

```bash
sudo apt update
sudo apt install -y postgresql
sudo service postgresql start
```

### 4. Dependencias y variables de entorno

```bash
npm install
cp .env.example .env
```

Edita `.env` y cambia `PGPASSWORD` por una contraseña de desarrollo (por ejemplo, la que
genera `openssl rand -hex 24`). El archivo `.env` no se sube al repositorio.

| Variable | Descripción | Valor por defecto |
|----------|-------------|-------------------|
| `PORT` | Puerto del servidor web | `3000` |
| `NODE_ENV` | `development`, `test` o `production` | `development` |
| `PGHOST` | Servidor de PostgreSQL | `127.0.0.1` |
| `PGPORT` | Puerto de PostgreSQL | `5432` |
| `PGUSER` | Rol de la aplicación | `taskflow` |
| `PGPASSWORD` | Contraseña del rol | (debes definirla) |
| `PGDATABASE` | Base de datos de desarrollo | `taskflow` |
| `PGDATABASE_TEST` | Base de datos para las pruebas | `taskflow_test` |

### 5. Configuración de PostgreSQL

Crea el rol de la aplicación. El comando lee la contraseña de `.env`, así que no queda
escrita en el historial de la terminal:

```bash
sudo -u postgres psql -v ON_ERROR_STOP=1 \
  -v pw="$(grep '^PGPASSWORD=' .env | cut -d= -f2-)" <<'SQL'
CREATE ROLE taskflow WITH LOGIN CREATEDB PASSWORD :'pw';
SQL
```

Crea las bases de datos, las tablas y los datos de demostración (no necesita `sudo`):

```bash
npm run db:seed
```

### 6. Arrancar

```bash
npm start
```

Abre <http://localhost:3000> en el navegador de Windows.

Si tras reiniciar WSL la aplicación responde "La base de datos no está disponible",
inicia el servicio: `sudo service postgresql start`.

## Scripts npm

| Script | Qué hace |
|--------|----------|
| `npm start` | Arranca el servidor |
| `npm run dev` | Arranca el servidor y lo reinicia al guardar cambios (`node --watch`) |
| `npm run db:setup` | Crea las bases `taskflow` y `taskflow_test` si no existen y aplica `db/schema.sql` |
| `npm run db:seed` | Lo mismo y además carga los datos demo (solo si la tabla está vacía) |
| `npm run build:demo` | Genera la demo estática (modo invitado) en `dist-demo/` |
| `npm test` | Ejecuta todas las pruebas contra la base `taskflow_test` |

Los scripts de base de datos son idempotentes: pueden repetirse sin borrar datos.

## Uso de la aplicación

- **Crear**: completa el formulario "Nueva tarea" y pulsa "Crear tarea".
- **Editar**: pulsa "Editar" en una tarea; el formulario se rellena con sus datos. Guarda con
  "Guardar cambios" o descarta con "Cancelar edición".
- **Cambiar estado**: usa el desplegable de estado de cada tarea.
- **Eliminar**: pulsa "Eliminar" y acepta la confirmación.
- **Filtrar, buscar y ordenar**: usa los controles sobre la lista. "Limpiar filtros" los restablece.
- El **resumen** superior muestra siempre los recuentos de todas las tareas, aunque haya filtros.
- **Cambiar de vista**: el selector "Vista" alterna entre "Lista" y "Tablero Kanban". En la
  versión local se abre la lista; en la demo, tras entrar como invitado, se pregunta qué vista
  se prefiere. La elección se recuerda en la pestaña.

## Tablero Kanban

Es una segunda vista, independiente de la lista: sus tarjetas **no** son las tareas de la lista
ni se sincronizan con ellas (tablas propias `kanban_columns` y `kanban_cards`).

- **Columnas**: se añaden con nombre (máx. 60 caracteres) y un límite WIP opcional (1 a 50).
  Se pueden renombrar, mover a la izquierda o a la derecha, vaciar y eliminar (con confirmación; al eliminar una
  columna se eliminan sus tarjetas). También se pueden pasar todas sus tarjetas a otra columna.
- **Tarjetas**: título obligatorio (máx. 150), descripción (máx. 2000), prioridad y fecha límite
  opcional. Se crean desde la columna, se editan y se eliminan con confirmación.
- **Reordenar tarjetas**: se arrastran con el ratón, dentro de su columna o a otra columna; una
  línea azul indica dónde caerán.
- **Reordenar columnas**: se arrastran con el asa ⠿ del encabezado. Los botones «Mover a la
  izquierda/derecha» del menú «Opciones» de cada columna hacen lo mismo con teclado y lector de
  pantalla.
- **Límite WIP**: es un aviso ("Límite WIP superado"), no un bloqueo.
- **Topes**: máximo 8 columnas por tablero y 50 tarjetas por columna; al superarlos la API
  responde `409` y la demo muestra el mismo mensaje.
- **Exportar a JSON**: descarga el tablero completo como archivo.
- En la versión local, `npm run db:seed` crea un tablero de ejemplo ("Por hacer", "En curso"
  con límite 2 y "Hecho") solo si el tablero no tiene ninguna columna. En la demo el tablero
  empieza vacío.

## Demo web (modo invitado)

### Cómo funciona para el visitante

1. Ve la pantalla "Bienvenido a TaskFlow" y pulsa **Entrar como invitado**. No hay registro,
   correo ni contraseña, y no se crea ninguna cuenta ni sesión en un servidor.
2. Usa la aplicación con todas sus funciones: crear, editar, eliminar, estados, prioridades,
   fechas, búsqueda, filtros, orden y resumen, además del tablero Kanban.
3. Sus tareas se guardan solo en su navegador. Otros visitantes no las ven.
4. Con **Salir y borrar mis datos** (pide confirmación) se eliminan sus tareas, su tablero y
   la vista elegida, y vuelve a la pantalla de bienvenida.

### Generar la demo

```bash
npm run build:demo
```

Crea la carpeta `dist-demo/` copiando `public/`, con dos diferencias: `js/config.js` queda en
modo `'session'` y no se incluye el adaptador de la API. No hay una segunda copia del frontend
que mantener: `dist-demo/` se regenera siempre desde `public/` y no se sube al repositorio.

Para probarla en tu equipo con cualquier servidor de archivos estáticos:

```bash
cd dist-demo && python3 -m http.server 8080
```

y abre <http://localhost:8080>. No hacen falta Express ni PostgreSQL.

### Publicarla en Vercel

La demo es un sitio estático. El archivo `vercel.json` ya deja el proyecto configurado:

| Ajuste | Valor |
|--------|-------|
| Framework Preset | Other |
| Build Command | `npm run build:demo` |
| Output Directory | `dist-demo` |
| Root Directory | Raíz del repositorio |
| Variables de entorno | Ninguna |

No se despliega el backend ni se necesita base de datos, y no hay secretos que configurar.

### Qué significa "temporal": límites de sessionStorage

- Los datos **sobreviven a una recarga** de la página.
- Pertenecen a **una pestaña**. Una pestaña nueva empieza vacía; una pestaña duplicada empieza
  con una copia de los datos y luego cada una sigue por separado.
- Normalmente se eliminan al cerrar la pestaña, pero **no está garantizado**: si el navegador
  restaura la sesión ("reabrir pestaña cerrada", "continuar donde lo dejaste"), pueden volver.
- La única forma segura de borrarlos desde la aplicación es **Salir y borrar mis datos**.
- No se sincronizan entre dispositivos ni navegadores, y no hay copia de seguridad.
- El espacio es limitado (unos pocos MB por sitio); si se agota, la aplicación avisa.
- Si el navegador bloquea el almacenamiento (por ejemplo, por una configuración de
  privacidad estricta), la aplicación lo explica y no entra al modo invitado.
- No guardes información sensible: cualquiera que use ese mismo navegador podría verla.

## API REST (versión local)

Base: `/api/tasks`. Todas las respuestas son JSON.

| Método | Ruta | Descripción | Respuestas |
|--------|------|-------------|------------|
| GET | `/api/tasks` | Lista tareas (admite filtros) | 200, 400 |
| GET | `/api/tasks/:id` | Devuelve una tarea | 200, 400, 404 |
| POST | `/api/tasks` | Crea una tarea | 201, 400 |
| PUT | `/api/tasks/:id` | Reemplaza todos los campos editables | 200, 400, 404 |
| PATCH | `/api/tasks/:id/status` | Cambia solo el estado | 200, 400, 404 |
| DELETE | `/api/tasks/:id` | Elimina una tarea | 204, 400, 404 |
| GET | `/api/health` | Comprueba que el servidor responde | 200 |

Parámetros de `GET /api/tasks` (todos opcionales):

| Parámetro | Valores |
|-----------|---------|
| `status` | `pending`, `in_progress`, `completed` |
| `priority` | `low`, `medium`, `high` |
| `q` | Texto a buscar en título y descripción (máx. 100 caracteres) |
| `sort` | `created_at` (por defecto), `due_date`, `priority` |
| `order` | `desc` (por defecto), `asc` |

Cuerpo para `POST` y `PUT`:

```json
{
  "title": "Preparar entrevista",
  "description": "Repasar los endpoints de la API",
  "status": "pending",
  "priority": "high",
  "dueDate": "2026-12-01"
}
```

Solo `title` es obligatorio. En `PUT`, los campos opcionales que no se envían vuelven a su
valor por defecto (es un reemplazo completo).

Ejemplos:

```bash
curl "http://localhost:3000/api/tasks?status=pending&sort=priority"

curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Nueva tarea","priority":"high"}'

curl -X PATCH http://localhost:3000/api/tasks/1/status \
  -H "Content-Type: application/json" \
  -d '{"status":"completed"}'
```

Formato de las respuestas:

```json
{ "data": [ { "id": 1, "title": "…", "description": null, "status": "pending",
              "priority": "medium", "dueDate": "2026-12-01",
              "createdAt": "…", "updatedAt": "…" } ],
  "meta": { "total": 1, "countsByStatus": { "pending": 1, "in_progress": 0, "completed": 0 } } }
```

```json
{ "error": { "message": "Datos de entrada no válidos",
             "details": [ { "field": "title", "message": "El título es obligatorio" } ] } }
```

Códigos de error: `400` entrada no válida o JSON malformado, `404` tarea o ruta inexistente,
`503` base de datos no disponible, `500` error inesperado (sin detalles internos).

### API del tablero Kanban (versión local)

Base: `/api/kanban`. Mismo formato de respuesta y de error que la API de tareas. Las `position`
empiezan en 0; si en un movimiento se omite `position` (o se pasa del final), el elemento va al
final.

| Método | Ruta | Descripción | Respuestas |
|--------|------|-------------|------------|
| GET | `/api/kanban` | Tablero completo: columnas en orden, cada una con sus tarjetas | 200 |
| POST | `/api/kanban/columns` | Crea una columna al final (`name`, `wipLimit` opcional) | 201, 400, 409 |
| PUT | `/api/kanban/columns/:id` | Cambia nombre y límite WIP | 200, 400, 404 |
| PATCH | `/api/kanban/columns/:id/move` | Mueve la columna a `position`; devuelve el tablero | 200, 400, 404 |
| DELETE | `/api/kanban/columns/:id` | Elimina la columna y sus tarjetas | 204, 400, 404 |
| POST | `/api/kanban/columns/:id/cards` | Crea una tarjeta al final de la columna | 201, 400, 404, 409 |
| DELETE | `/api/kanban/columns/:id/cards` | Vacía la columna (elimina sus tarjetas) | 204, 400, 404 |
| POST | `/api/kanban/columns/:id/move-cards` | Pasa todas sus tarjetas a `targetColumnId`; devuelve el tablero | 200, 400, 404, 409 |
| PUT | `/api/kanban/cards/:id` | Reemplaza título, descripción, prioridad y fecha | 200, 400, 404 |
| PATCH | `/api/kanban/cards/:id/move` | Mueve la tarjeta a `columnId` y `position` (opcional) | 200, 400, 404, 409 |
| DELETE | `/api/kanban/cards/:id` | Elimina la tarjeta | 204, 400, 404 |

`409` significa que se superó un tope (8 columnas, 50 tarjetas por columna). Los movimientos
renumeran las posiciones de las filas afectadas dentro de una **transacción**: o se guardan
todos los cambios o ninguno.

```bash
curl http://localhost:3000/api/kanban

curl -X PATCH http://localhost:3000/api/kanban/cards/1/move \
  -H "Content-Type: application/json" \
  -d '{"columnId":2,"position":0}'
```

## Pruebas

```bash
npm test
```

Requiere PostgreSQL en marcha y haber ejecutado `npm run db:setup`. Hay 138 pruebas:

- `tests/validator.test.js`: pruebas unitarias de validación (sin base de datos).
- `tests/tasks.api.test.js`: pruebas de integración reales. Envían peticiones HTTP a la
  aplicación con `supertest` y esta consulta PostgreSQL de verdad (base `taskflow_test`,
  que se vacía antes de cada prueba). Cubren CRUD, filtros, búsqueda, orden, ids
  inexistentes o malformados, campos vacíos, fechas inválidas y JSON malformado.
- `tests/db-down.test.js`: apunta la conexión a un puerto sin servicio para comprobar que
  la API responde `503` sin revelar detalles internos.
- `tests/health.test.js`: endpoint de salud.
- `tests/session-store.test.js`: ejecuta en Node el adaptador real de `sessionStorage` con un
  almacenamiento simulado. Cubre CRUD, validación, filtros, orden, persistencia, salida del
  modo invitado y errores (almacenamiento bloqueado, dañado o lleno).
- `tests/store-parity.test.js`: aplica las mismas operaciones a la API con PostgreSQL y al
  adaptador de `sessionStorage`, y exige resultados idénticos (datos, orden, recuentos y
  mensajes de error). Incluye casos del tablero Kanban.
- `tests/kanban.validator.test.js`: pruebas unitarias de las reglas del tablero (sin base de datos).
- `tests/kanban.api.test.js`: integración real contra PostgreSQL: CRUD de columnas y tarjetas,
  reordenación y renumeración de posiciones, movimiento entre columnas, topes (`409`), ids
  inexistentes y que una operación fallida no deje cambios a medias (transacciones).
- `tests/session-kanban.test.js`: el adaptador real del tablero en `sessionStorage` (con un
  almacenamiento simulado), incluidos datos dañados y salida del modo invitado.
- `tests/build-demo.test.js`: ejecuta el build y comprueba que `dist-demo/` contiene solo el
  frontend, en modo `'session'`, sin llamadas a la API ni archivos del backend.

Las pruebas no tocan la base de desarrollo `taskflow`.

## Limitaciones conocidas

- Versión local: un solo usuario y sin autenticación. El backend no debe exponerse a Internet
  tal como está; lo que se publica es la demo estática, que no tiene backend.
- Demo web: los datos son temporales y locales a cada pestaña (ver "Límites de sessionStorage").
- Las reglas de validación, filtros y orden existen dos veces: en el servidor y en
  `public/js/store/taskRules.js` (tareas) y `kanbanRules.js` (tablero). La prueba de paridad
  avisa si dejan de coincidir.
- Las tarjetas del Kanban son independientes de las tareas de la lista: mover una tarjeta no
  cambia el estado de ninguna tarea.
- Kanban: sin edición simultánea (un solo usuario); las columnas
  se pueden mover con el menú «Opciones» (teclado, lector de pantalla y pantallas táctiles), pero
  las tarjetas solo se mueven arrastrándolas: el arrastre está pensado para el ratón y no se ha
  probado en pantallas táctiles, donde las tarjetas no se pueden reordenar.
- Sin paginación: la lista devuelve todas las tareas que cumplen los filtros.
- No hay pruebas automatizadas de interfaz en un navegador real. Durante el desarrollo los dos
  modos se verificaron ejecutando sus módulos sobre un DOM simulado (jsdom); esa comprobación
  no forma parte del repositorio.
- La búsqueda usa `ILIKE` (coincidencia de texto simple, sensible a tildes).
- La marca "vencida" se calcula con la fecha del navegador.
- Sin despliegue ni configuración de producción (HTTPS, logs, copias de seguridad).
- Sin capturas de pantalla en este documento.
