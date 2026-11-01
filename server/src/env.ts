import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Environment variable ${name} wajib diisi (lihat server/.env.example)`);
  return value;
}

export const env = {
  pgAdmin: {
    host: required('PG_ADMIN_HOST'),
    port: Number(process.env.PG_ADMIN_PORT ?? 5432),
    user: required('PG_ADMIN_USER'),
    password: required('PG_ADMIN_PASSWORD'),
    database: required('PG_ADMIN_DATABASE'),
  },
  pgApp: {
    host: required('PG_APP_HOST'),
    port: Number(process.env.PG_APP_PORT ?? 5432),
    user: required('PG_APP_USER'),
    password: required('PG_APP_PASSWORD'),
    database: required('PG_APP_DATABASE'),
  },
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '12h',
  port: Number(process.env.PORT ?? 8787),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  seedPasswords: {
    superadmin: process.env.SEED_SUPERADMIN_PASSWORD ?? 'Superadmin#2026',
    staf: process.env.SEED_STAFF_PASSWORD ?? 'Staf#2026',
    pimpinan: process.env.SEED_PIMPINAN_PASSWORD ?? 'Pimpinan#2026',
  },
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES ?? 10 * 1024 * 1024),
  google: {
    clientId: required('GOOGLE_CLIENT_ID'),
    clientSecret: required('GOOGLE_CLIENT_SECRET'),
    refreshToken: required('GOOGLE_REFRESH_TOKEN'),
    rootFolderId: required('GOOGLE_DRIVE_ROOT_FOLDER_ID'),
  },
};
