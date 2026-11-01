import { Pool, type PoolClient } from 'pg';
import { env } from './env.js';
import { pgSslConfig } from './pgSsl.js';

// Pool admin: superuser, bypass RLS. Hanya dipakai oleh migrate/seed, TIDAK oleh rute HTTP.
export const adminPool = new Pool({
  host: env.pgAdmin.host,
  port: env.pgAdmin.port,
  user: env.pgAdmin.user,
  password: env.pgAdmin.password,
  database: env.pgAdmin.database,
  ssl: pgSslConfig(),
});

// Pool aplikasi: role non-superuser, tunduk pada RLS. Dipakai oleh seluruh rute HTTP.
export const appPool = new Pool({
  host: env.pgApp.host,
  port: env.pgApp.port,
  user: env.pgApp.user,
  password: env.pgApp.password,
  database: env.pgApp.database,
  ssl: pgSslConfig(),
});

export interface CallerContext {
  uid: string | null;
  role: string | null;
}

/**
 * Menjalankan fn dalam transaksi dengan konteks RLS (app.uid / app.role) terset via SET LOCAL,
 * sehingga policy di Postgres menegakkan akses yang sama seperti yang dicek di layer aplikasi.
 */
export async function withCaller<T>(ctx: CallerContext, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await appPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.uid', ctx.uid ?? '']);
    await client.query('SELECT set_config($1, $2, true)', ['app.role', ctx.role ?? '']);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
