import 'dotenv/config';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { google } from 'googleapis';

// Script sekali-jalan: login dengan akun Gmail arsip khusus kantor, ambil refresh token,
// buat folder root Drive untuk dokumen, lalu tulis hasilnya ke server/.env.
// Jalankan: npm run drive:auth

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET belum diisi di server/.env');
  process.exit(1);
}

const PORT = 53682;
const redirectUri = `http://127.0.0.1:${PORT}/oauth2callback`;
const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/drive.file'],
});

console.log('\nBuka URL ini di browser, LOGIN dengan akun Gmail arsip khusus kantor:\n');
console.log(authUrl);
console.log('\nMenunggu Anda menyelesaikan consent di browser...\n');

const server = http.createServer(async (req, res) => {
  if (!req.url?.startsWith('/oauth2callback')) {
    res.writeHead(404).end();
    return;
  }
  const code = new URL(req.url, redirectUri).searchParams.get('code');
  if (!code) {
    res.writeHead(400).end('Tidak ada code pada callback.');
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<h3>Berhasil. Anda bisa menutup tab ini dan kembali ke terminal.</h3>');
  server.close();

  try {
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.refresh_token) {
      console.error('\nTidak menerima refresh_token. Coba ulangi dengan mencabut akses app ini dulu di myaccount.google.com/permissions, lalu jalankan ulang script ini.');
      process.exit(1);
    }
    oauth2Client.setCredentials(tokens);

    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const folder = await drive.files.create({
      requestBody: {
        name: 'Portal KI NTB - Dokumen',
        mimeType: 'application/vnd.google-apps.folder',
      },
      fields: 'id',
    });
    const folderId = folder.data.id;
    if (!folderId) throw new Error('Gagal membuat folder root di Drive.');

    const envPath = path.resolve(import.meta.dirname, '..', '.env');
    let envContent = fs.readFileSync(envPath, 'utf8');
    envContent = envContent.replace(/^GOOGLE_REFRESH_TOKEN=.*$/m, `GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
    envContent = envContent.replace(/^GOOGLE_DRIVE_ROOT_FOLDER_ID=.*$/m, `GOOGLE_DRIVE_ROOT_FOLDER_ID=${folderId}`);
    fs.writeFileSync(envPath, envContent);

    console.log('\nSukses. server/.env sudah diisi otomatis:');
    console.log(`  GOOGLE_REFRESH_TOKEN=${tokens.refresh_token.slice(0, 10)}... (disembunyikan sebagian)`);
    console.log(`  GOOGLE_DRIVE_ROOT_FOLDER_ID=${folderId}`);
    console.log('\nFolder "Portal KI NTB - Dokumen" sudah dibuat di Drive akun yang baru login.');
    process.exit(0);
  } catch (err) {
    console.error('Gagal menukar code atau membuat folder:', err);
    process.exit(1);
  }
});

server.listen(PORT);
