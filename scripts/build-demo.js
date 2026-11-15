// Genera la demo estática (modo invitado) en dist-demo/ a partir de public/.
//
//   - Copia el frontend compartido tal cual: no hay una segunda copia que mantener.
//   - Sustituye js/config.js para que el almacenamiento sea sessionStorage.
//   - Deja fuera el adaptador de la API: la demo no puede llamar al backend.
//
// Solo usa módulos nativos de Node. Uso: npm run build:demo

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'public');
const OUTPUT_DIR = path.join(ROOT, 'dist-demo');

// Archivos de public/ que no forman parte de la demo (rutas relativas a public/).
const EXCLUDED = new Set([
  path.join('js', 'store', 'apiStore.js'), // adaptador HTTP: solo versión local
  path.join('js', 'package.json'),         // solo sirve a Node para las pruebas
]);

const DEMO_CONFIG = `// Generado por scripts/build-demo.js. No editar: se sobrescribe en cada build.
// Demo web: las tareas se guardan en sessionStorage (modo invitado).

export const STORAGE_MODE = 'session';
`;

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
  });
}

function build() {
  // Se parte siempre de cero para que no queden archivos de builds anteriores.
  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });

  fs.cpSync(SOURCE_DIR, OUTPUT_DIR, {
    recursive: true,
    filter: (source) => !EXCLUDED.has(path.relative(SOURCE_DIR, source)),
  });

  fs.writeFileSync(path.join(OUTPUT_DIR, 'js', 'config.js'), DEMO_CONFIG);

  const files = listFiles(OUTPUT_DIR).map((file) => path.relative(OUTPUT_DIR, file)).sort();

  // Comprobación de seguridad: ningún archivo de la demo debe mencionar la API.
  const offenders = files.filter((file) =>
    fs.readFileSync(path.join(OUTPUT_DIR, file), 'utf8').includes('/api/')
  );
  if (offenders.length > 0) {
    throw new Error(`La demo no debe referenciar la API: ${offenders.join(', ')}`);
  }

  console.log(`Demo generada en dist-demo/ (${files.length} archivos):`);
  for (const file of files) console.log(`  ${file}`);
}

build();
