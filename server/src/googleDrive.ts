import { google } from 'googleapis';
import { env } from './env.js';

const oauth2Client = new google.auth.OAuth2(env.google.clientId, env.google.clientSecret);
oauth2Client.setCredentials({ refresh_token: env.google.refreshToken });

const drive = google.drive({ version: 'v3', auth: oauth2Client });

async function accessToken(): Promise<string> {
  const { token } = await oauth2Client.getAccessToken();
  if (!token) throw new Error('Gagal mengambil access token Drive.');
  return token;
}

// Buat sesi resumable upload; klien (browser) PUT byte file langsung ke URL ini,
// tidak lewat body Netlify Function sama sekali (menghindari limit payload serverless).
export async function createResumableSession(params: { name: string; mimeType: string }): Promise<string> {
  const token = await accessToken();
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': params.mimeType,
    },
    body: JSON.stringify({ name: params.name, parents: [env.google.rootFolderId] }),
  });
  if (!res.ok) throw new Error(`Gagal membuat sesi upload Drive (${res.status}): ${await res.text()}`);
  const location = res.headers.get('Location');
  if (!location) throw new Error('Drive tidak mengembalikan session URL.');
  return location;
}

export interface DriveFileMetadata {
  size: number;
  md5Checksum: string | null;
  mimeType: string;
  parents: string[];
}

export async function getFileMetadata(fileId: string): Promise<DriveFileMetadata> {
  const res = await drive.files.get({ fileId, fields: 'size,md5Checksum,mimeType,parents' });
  return {
    size: Number(res.data.size ?? 0),
    md5Checksum: res.data.md5Checksum ?? null,
    mimeType: res.data.mimeType ?? 'application/octet-stream',
    parents: res.data.parents ?? [],
  };
}

// URL + token berumur pendek (~1 jam, scope drive.file) untuk diambil langsung oleh browser.
// PENTING: token harus dikirim via header Authorization, BUKAN query string — Drive API
// (dan infrastruktur anti-abuse Google di depannya) menolak/blokir access_token di query string
// untuk endpoint ini (diverifikasi langsung: query-param => 403 halaman anti-abuse,
// header Authorization => 200 + CORS lengkap untuk origin apa pun).
export async function getShortLivedDownload(fileId: string): Promise<{ url: string; accessToken: string }> {
  const token = await accessToken();
  return { url: `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, accessToken: token };
}

// Proxy penuh (buffer) untuk file kecil, supaya mayoritas dokumen tidak pernah mengekspos token ke browser.
export async function getFileBuffer(fileId: string): Promise<Buffer> {
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
  return Buffer.from(res.data as ArrayBuffer);
}

export async function deleteFromDrive(fileId: string) {
  await drive.files.delete({ fileId });
}
