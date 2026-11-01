import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { env } from './env.js';
import { pgSslConfig } from './pgSsl.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../db/migrations');

function quoteIdent(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"';
}

async function ensureDatabaseExists() {
  const maint = new Client({
    host: env.pgAdmin.host,
    port: env.pgAdmin.port,
    user: env.pgAdmin.user,
    password: env.pgAdmin.password,
    database: 'postgres',
    ssl: pgSslConfig(),
  });
  await maint.connect();
  const { rowCount } = await maint.query('SELECT 1 FROM pg_database WHERE datname = $1', [env.pgAdmin.database]);
  if (rowCount === 0) {
    console.log(`Membuat database ${env.pgAdmin.database}...`);
    await maint.query(`CREATE DATABASE ${quoteIdent(env.pgAdmin.database)}`);
  }
  await maint.end();
}

async function run() {
  await ensureDatabaseExists();

  const db = new Client({
    host: env.pgAdmin.host,
    port: env.pgAdmin.port,
    user: env.pgAdmin.user,
    password: env.pgAdmin.password,
    database: env.pgAdmin.database,
    ssl: pgSslConfig(),
  });
  await db.connect();

  await db.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const { rowCount } = await db.query('SELECT 1 FROM _migrations WHERE filename = $1', [file]);
    if (rowCount && rowCount > 0) {
      console.log(`skip ${file} (sudah diterapkan)`);
      continue;
    }
    console.log(`menerapkan ${file}...`);
    let sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    sql = sql.replaceAll('__PORTAL_APP_PASSWORD__', env.pgApp.password.replace(/'/g, "''"));
    sql = sql.replaceAll('__DATABASE_NAME__', quoteIdent(env.pgAdmin.database));
    await db.query(sql);
    await db.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
    console.log(`  ok: ${file}`);
  }

  await db.end();
  console.log('Migrasi selesai.');
}

run().catch((err) => {
  console.error('Migrasi gagal:', err);
  process.exit(1);
});
