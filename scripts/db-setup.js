// Prepara las bases de datos de desarrollo y de pruebas:
//   1. Crea las bases si no existen (el rol necesita el permiso CREATEDB).
//   2. Aplica db/schema.sql (idempotente).
//   3. Con --seed, carga db/seed.sql en la base de desarrollo.
// Uso: npm run db:setup   |   npm run db:seed

const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const SAFE_DB_NAME = /^[a-z_][a-z0-9_]*$/;

function readSql(file) {
  return fs.readFileSync(path.join(__dirname, '..', 'db', file), 'utf8');
}

async function ensureDatabase(name) {
  // Los nombres de base de datos no se pueden pasar como parámetro ($1) en CREATE DATABASE,
  // por eso se valida el nombre con una lista blanca de caracteres antes de usarlo.
  if (!SAFE_DB_NAME.test(name)) {
    throw new Error(`Nombre de base de datos no válido: ${name}`);
  }
  const admin = new Client({ database: 'postgres' });
  await admin.connect();
  try {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (rowCount === 0) {
      await admin.query(`CREATE DATABASE "${name}"`);
      console.log(`Base de datos creada: ${name}`);
    } else {
      console.log(`Base de datos existente: ${name}`);
    }
  } finally {
    await admin.end();
  }
}

async function runSql(database, file) {
  const client = new Client({ database });
  await client.connect();
  try {
    await client.query(readSql(file));
    console.log(`  ${file} aplicado en ${database}`);
  } finally {
    await client.end();
  }
}

async function main() {
  const devDb = process.env.PGDATABASE;
  const testDb = process.env.PGDATABASE_TEST;
  if (!devDb || !testDb) {
    throw new Error('Faltan PGDATABASE o PGDATABASE_TEST en .env');
  }

  for (const db of [devDb, testDb]) {
    await ensureDatabase(db);
    await runSql(db, 'schema.sql');
  }

  if (process.argv.includes('--seed')) {
    await runSql(devDb, 'seed.sql');
  }
}

main().catch((err) => {
  console.error('Error preparando la base de datos:', err.message);
  process.exitCode = 1;
});
