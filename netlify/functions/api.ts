import serverless from 'serverless-http';
import app from '../../server/src/app.js';

// Redirect /api/* -> /.netlify/functions/api/:splat (lihat netlify.toml) membuat event.path
// jadi "/.netlify/functions/api/auth/login". Strip "/.netlify/functions" supaya sisanya
// ("/api/auth/login") cocok dengan mounting route Express yang sudah pakai prefix /api.
export const handler = serverless(app, { basePath: '/.netlify/functions' });
