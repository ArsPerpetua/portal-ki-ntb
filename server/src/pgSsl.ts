export function pgSslConfig(): { rejectUnauthorized: boolean } | undefined {
  return process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : undefined;
}
