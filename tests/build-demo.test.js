// Comprueba el artefacto estático de la demo: ejecuta el build real y revisa dist-demo/.

const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist-demo');

function listFiles(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(fullPath, base) : [path.relative(base, fullPath)];
  });
}

const read = (dir, file) => fs.readFileSync(path.join(dir, file), 'utf8');

let files;

before(() => {
  // Sin variables de la base de datos: el build no debe necesitar PostgreSQL ni .env.
  const env = { PATH: process.env.PATH };
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-demo.js')], { env, stdio: 'pipe' });
  files = listFiles(DIST).sort();
});

test('el build genera exactamente los archivos del frontend de la demo', () => {
  assert.deepEqual(files, [
    'css/styles.css',
    'favicon.svg',
    'index.html',
    'js/config.js',
    'js/guest.js',
    'js/kanban.js',
    'js/kanbanDrag.js',
    'js/kanbanUi.js',
    'js/main.js',
    'js/store/StoreError.js',
    'js/store/index.js',
    'js/store/kanbanRules.js',
    'js/store/sessionAccess.js',
    'js/store/sessionKanban.js',
    'js/store/sessionStore.js',
    'js/store/taskRules.js',
    'js/ui.js',
    'js/view.js',
  ]);
});

test('la demo queda configurada en modo sessionStorage y el código fuente sigue en modo API', () => {
  assert.match(read(DIST, 'js/config.js'), /STORAGE_MODE = 'session'/);
  assert.match(read(path.join(ROOT, 'public'), 'js/config.js'), /STORAGE_MODE = 'api'/);
});

test('ningún archivo de la demo contiene llamadas a la API ni usa fetch', () => {
  for (const file of files) {
    const content = read(DIST, file);
    assert.doesNotMatch(content, /\/api\//, file);
    assert.doesNotMatch(content, /\bfetch\(/, file);
  }
});

test('la demo no incluye backend, SQL, configuración privada ni dependencias', () => {
  for (const file of files) {
    assert.doesNotMatch(file, /\.env|\.sql$|package(-lock)?\.json$|node_modules|^src\/|^db\/|^tests\//, file);
    assert.doesNotMatch(read(DIST, file), /PGPASSWORD|PGUSER|process\.env|require\(/, file);
  }
});

test('salvo config.js, los archivos de la demo son copias idénticas de public/', () => {
  for (const file of files.filter((name) => name !== 'js/config.js')) {
    assert.equal(read(DIST, file), read(path.join(ROOT, 'public'), file), file);
  }
});

test('index.html solo referencia recursos que existen en la demo', () => {
  const html = read(DIST, 'index.html');
  const references = [...html.matchAll(/(?:href|src)="([^"#]+)"/g)].map((match) => match[1]);
  assert.deepEqual(references.sort(), ['css/styles.css', 'favicon.svg', 'js/main.js']);
  for (const reference of references) assert.ok(files.includes(reference), reference);
});
