# Portal Digital Kekayaan Intelektual NTB

**Aplikasi kerja internal (v0.2) — React/Vite/TypeScript di frontend, Express + PostgreSQL (dengan Row Level Security asli) di backend lokal.**

> **Status.** Backend Express yang sama jalan dalam dua bentuk: lokal sebagai proses Node biasa (`npm run dev:all`), dan di Netlify sebagai satu Function (`netlify/functions/api.ts`, dibungkus `serverless-http`) di belakang redirect `/api/*`. Database: Postgres lokal untuk dev, **Supabase Postgres** untuk produksi (Supabase dipakai HANYA sebagai hosting Postgres terkelola — auth tetap custom JWT, bukan Supabase Auth; pola RLS `app.uid`/`app.role` portabel 1:1 karena murni Postgres). Dokumen disimpan di Google Drive (OAuth `drive.file`) lewat pola **direct-to-Drive**: byte file tidak pernah lewat body Netlify Function (upload via resumable session, download via URL/token berumur pendek untuk file besar) — lihat bagian setup di bawah. Jangan jadikan data di lingkungan ini sebagai sumber resmi kantor sebelum go-live.

## Menjalankan di lokal

Prasyarat: Node.js 20.19+/22.12+, PostgreSQL berjalan di lokal (default `localhost:5432`, user `postgres`), akses internet untuk `npm install`.

### 1) Setup backend (sekali saja)

```bash
cd server
cp .env.example .env     # lalu sesuaikan PG_ADMIN_PASSWORD dsb dengan kredensial Postgres Anda
npm install
npm run migrate          # membuat database, role portal_app, tabel, dan RLS policy
npm run seed             # mengisi 7 indikator, akun contoh, dan data uji
```

#### Google Drive (penyimpanan dokumen)

1. Di Google Cloud Console (akun arsip kantor atau akun lain): buat project, aktifkan **Google Drive API**, lalu di **OAuth consent screen** (External, status Testing) tambahkan email akun arsip Drive sebagai **Test user**.
2. Buat **OAuth Client ID** tipe **Desktop app**, isi `GOOGLE_CLIENT_ID` dan `GOOGLE_CLIENT_SECRET` di `server/.env`.
3. Jalankan `npm run drive:auth` (dari folder `server/`), buka URL yang muncul, login dengan akun arsip Drive. Script otomatis mengisi `GOOGLE_REFRESH_TOKEN` dan `GOOGLE_DRIVE_ROOT_FOLDER_ID` di `server/.env` serta membuat folder root "Portal KI NTB - Dokumen" di Drive akun tersebut.
4. Scope yang dipakai: `drive.file` (app hanya bisa mengakses file yang ia buat sendiri). Karena consent screen masih Testing, refresh token berisiko berakhir — lihat peringatan di PRD §10 sebelum produksi.

Akun hasil seed (role / email / password) akan tercetak di akhir `npm run seed`, defaultnya:

| Role | Email | Password |
|---|---|---|
| SUPERADMIN | `superadmin@portalki.ntb.go.id` | `Superadmin#2026` |
| STAF (assigned ke KIK, bisa verifikasi) | `staf.kik@portalki.ntb.go.id` | `Staf#2026` |
| STAF (assigned ke IG, tanpa hak verifikasi) | `staf.ig@portalki.ntb.go.id` | `Staf#2026` |
| PIMPINAN | `pimpinan@portalki.ntb.go.id` | `Pimpinan#2026` |

### 2) Jalankan backend + frontend

Dari root folder project:

```bash
npm install
npm run dev:all     # menjalankan Vite (5173) dan API Express (8787) bersamaan
```

Atau dua terminal terpisah: `npm run server` (backend) dan `npm run dev` (frontend). Buka `http://localhost:5173` dan login dengan salah satu akun di atas.

## Deploy ke Netlify + Supabase

1. **Supabase**: buat project di supabase.com/dashboard. Dari Project Settings → Database, ambil **Direct connection** (port 5432) dan **Transaction pooler** (port 6543). Database name selalu `postgres`. Isi `server/.env` lokal dengan Direct connection, lalu `npm run migrate && npm run seed` dari laptop — ini membuat role `portal_app`, semua tabel, dan RLS policy di Supabase (logika migrasi tidak berubah, cuma menunjuk host berbeda).
2. **Netlify env vars** (Site settings → Environment variables): `PG_ADMIN_*` = Direct connection Supabase, `PG_APP_*` = Transaction pooler Supabase, `PG_SSL=true`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CORS_ORIGIN=<URL Netlify produksi>`, `MAX_UPLOAD_BYTES=10485760`, `GOOGLE_CLIENT_ID/CLIENT_SECRET/REFRESH_TOKEN/DRIVE_ROOT_FOLDER_ID` (sama seperti `server/.env`), `VITE_API_URL=/api`.
3. Deploy (Git integration Netlify, atau `netlify deploy --prod`). `netlify.toml` sudah mengatur build (`npm install && npm run build`, workspace `server` ikut terinstal), bundling Function, dan redirect `/api/*` → Function sebelum fallback SPA.
4. Uji: login, upload dokumen (termasuk yang mendekati 10 MiB), download, cek `audit_logs`, cek dokumen `RESTRICTED` tidak bisa diakses user tanpa hak.

**Uji Function secara lokal** (`npm run netlify:dev`, perlu `netlify link` dulu ke site yang sudah dibuat supaya env var ter-fetch otomatis dari Netlify — tanpa link, Function akan gagal start karena `server/.env` tidak otomatis terbaca oleh `netlify dev`, hanya root `.env` yang terbaca). Sudah diverifikasi end-to-end secara lokal (health check, login, RLS, upload-session → PUT ke Drive → upload-complete, download, archive — semua sukses lewat redirect `/api/*` → Function yang sama seperti produksi).

## Yang sudah berfungsi nyata (bukan simulasi)

- Login email/password dengan JWT, role `SUPERADMIN` / `STAF` / `PIMPINAN`.
- **Row Level Security asli di PostgreSQL**: backend terhubung sebagai role `portal_app` (non-superuser), setiap request men-set `app.uid`/`app.role` lalu Postgres menegakkan policy SELECT/INSERT/UPDATE per tabel — bukan sekadar pengecekan di kode aplikasi.
- Dashboard & direktori 7 indikator dengan angka dari `ki_records` berstatus `VERIFIED` (bukan jumlah file).
- Alur draft → menunggu review → terverifikasi/ditolak, dengan hak tulis dan hak verifikasi terpisah per penugasan indikator (`indicator_assignments`).
- Pusat dokumen: upload **direct-to-Drive** (klien dapat sesi resumable dari API, PUT byte langsung ke Google — byte tidak lewat body Function), metadata + Drive file id + checksum (md5 dari Drive) di Postgres; download diproxy penuh untuk file ≤4MB, atau URL berumur pendek untuk file lebih besar — bukan link publik, filter kategori/indikator/pencarian.
- Audit log (`audit_logs`) tercatat untuk login, create/verify/reject record, upload/download/archive dokumen, assign/unassign staf — hanya terlihat penuh oleh `SUPERADMIN`; role lain melihat feed aktivitas ringan dari data yang memang terlihat bagi mereka.
- Pengaturan & Akses: Superadmin dapat menugaskan staf ke indikator (hak tulis/verifikasi) langsung dari UI.
- Katalog aplikasi dari tabel `applications` (masih perlu diisi URL resmi oleh admin).

## Yang belum diimplementasikan

- Konsolidasi OAuth consent screen Google dari status Testing ke publishing yang stabil (lihat peringatan refresh token 7 hari di PRD §10) sebelum produksi.
- Migrasi ke Supabase Auth (PRD menyebutnya sebagai visi awal) — sengaja belum dilakukan; custom JWT dipertahankan untuk mempercepat deploy, lihat `README.md` bagian deploy.
- Versi dokumen, kegiatan/narasumber, ekspor PDF/Excel, migrasi data Apps Script (semua P1 di PRD).
- `demo-standalone.html` adalah prototype visual awal (data dummy, tanpa backend) — dipertahankan sebagai referensi desain, tidak lagi menjadi jalur utama.

## Struktur proyek

- `src/` — frontend React. `src/api.ts` client API, `src/auth.tsx` context auth + halaman login, `src/main.tsx` UI utama, `src/style.css` desain & animasi.
- `server/` — backend Express + TypeScript (npm workspace dari root). `server/src/app.ts` perakitan Express (dipakai lokal lewat `index.ts` dan oleh Netlify Function), `server/db/migrations/` skema SQL + RLS, `server/src/routes/` endpoint API, `server/src/seed.ts` data awal, `server/src/googleDrive.ts` klien Drive API (resumable session, metadata, URL berumur pendek), `server/src/googleDriveAuth.ts` script sekali-jalan ambil refresh token (`npm run drive:auth`), `server/src/pgSsl.ts` helper SSL Supabase.
- `netlify/functions/api.ts` — pembungkus `serverless-http` di atas `server/src/app.ts`, dipanggil lewat redirect `/api/*` di `netlify.toml`.
- `docs/PRD_Portal_Digital_KI_NTB_v1.md` — spesifikasi lengkap.

## Jalur kerja menuju produksi (dari PRD)

1. Validasi persetujuan penggunaan Gmail consumer oleh TI/pengelola data kantor dan definisi 7 angka resmi.
2. Pindahkan OAuth consent screen dari Testing ke status yang tidak mengekspos risiko refresh token berakhir 7 hari.
3. (Opsional, P1) Migrasi login dari custom JWT ke Supabase Auth bila dibutuhkan governance terpusat — RLS tidak perlu diubah, hanya jalur login & middleware.
4. Migrasi data Apps Script/Sheets/Drive; verifikasi metadata dan role; UAT + backup & rollback sebelum go-live.

## Sumber spesifikasi

Lihat `docs/PRD_Portal_Digital_KI_NTB_v1.md` dan `docs/PRD_Portal_Digital_KI_NTB_v1.docx`.

## Lisensi

Prototype disiapkan untuk tahap pengembangan internal. Identitas visual yang digunakan adalah **simbol desain generik**, bukan lambang resmi atau pengesahan instansi.
