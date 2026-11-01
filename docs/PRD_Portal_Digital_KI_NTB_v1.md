# PRODUCT REQUIREMENTS DOCUMENT
## Portal Digital Kekayaan Intelektual Nusa Tenggara Barat (KI NTB)

**Versi:** 1.0 — Rancangan MVP | **Tanggal:** 31 Oktober 2026  
**Pemilik produk:** Kantor Wilayah Kementerian Hukum Nusa Tenggara Barat (perlu konfirmasi penanggung jawab formal)  
**Status:** Draft untuk validasi pemangku kepentingan; belum persetujuan implementasi/keamanan  
**Platform target:** Web aplikasi internal, desktop dan mobile  
**Stack usulan:** React + TypeScript + Vite; Netlify; Supabase Auth/PostgreSQL; Google Drive API v3 melalui Gmail arsip khusus.

> **Penting:** Angka dan contoh berkas pada prototype UI adalah simulasi, bukan statistik resmi KI NTB. PRD ini menetapkan target produk; prototype yang dilampirkan belum mempunyai koneksi produksi ke Supabase/Drive.

---

## 1. Ringkasan eksekutif

Portal Digital KI NTB adalah ruang kerja internal untuk pimpinan dan staf yang menyatukan **monitoring tujuh indikator KI**, **direktori entitas yang membentuk statistik**, **pengetahuan ringkas per indikator**, **arsip dokumen dan materi kegiatan**, **katalog aplikasi**, serta **riwayat aktivitas**. Portal dirancang agar pimpinan dapat menjawab pertanyaan seperti “berapa KIK yang tercatat, apa saja, dari wilayah mana, dan mana bukti pendukungnya” tanpa menelusuri folder atau beberapa spreadsheet.

Keputusan kunci: **Supabase menjadi sumber kebenaran entitas dan angka resmi**, sedangkan **Google Drive pribadi yang didedikasikan untuk kantor** menjadi penyimpanan fisik berkas. Jumlah dokumen tidak dipakai sebagai proksi jumlah entitas KI. Publikasi data resmi memerlukan status dan sumber verifikasi yang jelas.

## 2. Problem dan peluang

**Masalah saat ini:** data tersebar di Google Sheets, Drive, dan Google Apps Script; angka otomatis berdasarkan file berisiko menyamakan 1 berkas dengan 1 entitas; pencarian dokumen sambutan dan materi narasumber belum terintegrasi ke objek KI/kegiatan; status verifikasi, histori, dan kepemilikan akun perlu diperkuat saat migrasi.

**Peluang:** satu dashboard yang memberi jawaban cepat dan dapat ditelusuri; staf mengelola data per indikator tanpa hak berlebih; dokumen kegiatan dapat ditemukan lewat topik, narasumber, kegiatan, dan pencarian; perubahan data bisa diaudit.

## 3. Tujuan dan metrik sukses

| Tujuan | Metrik awal / target validasi |
|---|---|
| Pimpinan menemukan informasi indikator | 90% skenario uji dapat diselesaikan dalam ≤ 3 klik dari dashboard |
| Pengguna menemukan naskah/materi | 90% uji pencarian menemukan berkas yang benar dalam ≤ 30 detik |
| Statistik dapat dipertanggungjawabkan | 100% angka yang berlabel resmi punya definisi, sumber, waktu, status, dan penanggung jawab |
| Pengelolaan dokumen stabil | ≥ 99% percobaan upload file valid ≤ 10 MiB berhasil pada pengujian penerimaan terkontrol |
| Hak akses tepat | 0 kelolosan kasus negatif dari pengujian RLS/API/Drive |
| UX responsif | LCP p75 < 2,5 detik pada lingkungan uji yang disepakati; halaman utama dapat digunakan di 360 px |

Angka target di atas merupakan **hipotesis penerimaan**, bukan pengukuran yang sudah tercapai.

## 4. Pemangku kepentingan & persona

| Persona | Kebutuhan utama | Hak awal |
|---|---|---|
| PIMPINAN | Buka angka, daftar entitas, sumber, dan dokumen yang diizinkan; gunakan search | Baca data terverifikasi dan arsip sesuai klasifikasi |
| STAF INDIKATOR | Input/edit entitas yang ditugaskan, unggah bukti, usulkan verifikasi | Baca menurut kebijakan + edit per assignment |
| SEKRETARIAT / PENGELOLA MATERI | Unggah sambutan dan materi narasumber, kategorisasi kegiatan | Hak khusus dokumen kegiatan, bukan otomatis seluruh indikator |
| SUPERADMIN | Kelola pengguna, penugasan, referensi indikator, CMS, aplikasi, verifikasi yang didelegasikan dan audit | Akses administrasi terbatas kebutuhan pekerjaan |

**Catatan:** permission dokumen *tidak otomatis sama* dengan permission edit indikator; pemisahan peran pengelola materi dan staf indikator harus divalidasi dengan kantor.

## 5. Cakupan MVP dan di luar cakupan

### Termasuk MVP (P0)
1. Login email/password Supabase tanpa kewajiban Google Workspace; sesi aman dan logout.
2. Dashboard tujuh kategori: Sentra KI, IG, KIK, Perda KI, Paten, Merek Kolektif, Merek Kolektif KDMP.
3. Halaman detail tiap indikator: definisi ringkas CMS, angka, periode, sumber, status verifikasi, daftar entitas, filter wilayah/tahun, bukti terkait.
4. CRUD entitas KI dengan atribut umum + spesifik per indikator; status draft/menunggu verifikasi/terverifikasi/arsip; guard anti-duplikasi.
5. Angka derived dari entitas terverifikasi dan opsi snapshot MANUAL dengan alasan/sumber/catatan persetujuan.
6. Pusat dokumen: upload dan download privat file ≤ 10 MiB, kategori Sambutan/Materi Narasumber/Pendukung/Referensi; pencarian dan relasi multi-tag.
7. CMS konten edukasi, katalog aplikasi yang dikurasi, log aktivitas, penugasan staf ↔ indikator, role dan RLS.
8. Migrasi data lama, validasi dan uji regresi, backup dan rekonsiliasi metadata-Drive.

### Tahap P1
- Versi dokumen dan revisi, fitur kegiatan/narasumber lengkap, ekspor PDF/Excel, dashboard tren historis sesungguhnya, preview DOCX/PPTX terkontrol, notifikasi verifikasi, pencarian isi PDF berizin.

### Di luar MVP
- Chatbot AI bebas, aplikasi mobile native, portal publik, publikasi otomatis ke sistem nasional, OCR massal, upload video/berkas >10 MiB, tanda tangan elektronik.

## 6. Information architecture & layar

**Navigasi utama:** Dashboard → Indikator KI → Pusat Dokumen → Katalog Aplikasi → Aktivitas. **Pengelolaan:** Pengaturan & Akses (khusus role berizin); CMS serta manajemen pengguna dapat tampil sebagai submenu admin.

### 6.1 Dashboard
- Hero ringkas, tanggal pembaruan data, penanda status verifikasi, tujuh kartu indikator.
- Statistik utama, konteks definisi, jumlah entitas (bukan jumlah file), dan aksi membuka daftar detail.
- Panel aktivitas terkini, pembaruan terbaru, tautan cepat ke dokumen.
- Pada produksi jangan tampilkan “angka resmi” jika dataset belum diverifikasi; tampilkan status “Belum tersedia / Perlu verifikasi”.

### 6.2 Detail indikator
- Judul, definisi singkat, cakupan/rumus penghitungan, jumlah menurut periode, sumber, timestamp, verifikator.
- Daftar entitas dengan pencarian, filter kabupaten/kota, status, tahun; detail record menampilkan dokumen bukti.
- Field dinamis mengikuti definisi ketujuh kategori (Lampiran A).

### 6.3 Pusat dokumen
- Tab kategori, filter indikator, kata kunci, status akses; tambah dokumen; detail metadata.
- Relasi satu file ke beberapa indikator atau kegiatan **tanpa duplikasi fisik**.
- File privat; download/preview harus melewati pemeriksaan backend; tidak ada tautan publik permanen.

### 6.4 Pengaturan
- Admin mengelola role, assignment per indikator, nilai manual, sumber data, status verifikasi, dan katalog aplikasi.
- Audit read-only untuk pihak yang berwenang; pembatalan/penghapusan berkas wajib tercatat.

## 7. Business rules dan perhitungan

**Entitas vs file:** `count(KI)` berasal dari `ki_records` berstatus memenuhi definisi indikator pada periode yang dipilih. `count(files)` hanya untuk metrik dokumen. Satu KIK dapat memiliki beberapa berkas.

**Aturan resmi:** tiap indikator memerlukan `counting_definition`, `counting_statuses`, periode pelaporan, pemilik data, dan sumber. Merek, paten, IG, dan pencatatan KIK dapat memiliki tahap permohonan berbeda, sehingga tidak boleh dijumlahkan sebagai “terdaftar” tanpa normalisasi status.

**Mode statistik:** `DERIVED` dari record yang terverifikasi atau `MANUAL` dari snapshot yang diinput petugas. Snapshot manual harus punya angka, satuan, tanggal acuan, sumber, alasan, penginput, verifier, status; angka yang belum lolos verifikasi tidak masuk kartu resmi.

**Verifikasi:** staf membuat/mengubah record → status `DRAFT` / `PENDING_REVIEW` → verifikator berwenang menyetujui (`VERIFIED`) atau menolak dengan alasan. Perubahan setelah terverifikasi kembali membutuhkan review jika memengaruhi penghitungan. Rekam audit setiap perubahan.

**Akses:** untuk aksi tulis indikator, pengguna harus berstatus aktif dan punya assignment indikator serta permission action (atau superadmin). Pimpinan bersifat read-only. File mewarisi klasifikasi akses *dan* dapat punya ACL kategori khusus, misalnya naskah terbatas.

## 8. Alur pengguna utama + kriteria penerimaan

### U-01 Pimpinan mencari KIK
**Given** pengguna memiliki izin baca; **When** membuka dashboard → KIK → memilih kabupaten; **Then** terlihat total terverifikasi berikut definisi, periode, sumber, daftar entitas, status, dan akses ke bukti yang diizinkan; hasil filter konsisten dengan total scope yang dipilih.

### U-02 Staf mengusulkan entitas
**Given** staf ditugaskan di indikator IG; **When** membuat entitas IG dengan field wajib dan dokumen bukti; **Then** tersimpan sebagai draft/pending dan **belum** menaikkan total resmi sebelum verifikasi; staf tanpa assignment ditolak di UI, API, dan RLS.

### U-03 Sekretariat mengunggah materi
**Given** pengunggah punya hak kategori Materi Narasumber; **When** upload PPTX ≤ 10 MiB dengan judul, kegiatan, narasumber, topik KI; **Then** Drive menerima berkas privat, `documents` berisi file ID/ukuran/MIME, dan berkas dapat ditelusuri dari kategori maupun topiknya. Jika gagal di tengah, status tetap pending dan retry melanjutkan offset benar.

### U-04 Pimpinan mengunduh sambutan
**Given** pengguna memiliki akses; **When** memilih sambutan dan klik unduh; **Then** backend mengecek sesi+ACL, mengirim konten tanpa membuka izin Drive menjadi publik dan audit download sesuai kebijakan. User tanpa akses menerima 403 tanpa metadata sensitif.

### U-05 Admin meninjau audit
**Given** superadmin sah; **When** memfilter aktivitas berdasarkan aktor, jenis aksi, tanggal; **Then** log menampilkan tindakan, objek, waktu, dan metadata yang diizinkan serta tidak bisa dimodifikasi melalui UI biasa.

## 9. Desain pengalaman & motion system

**Arah desain:** premium institutional, ringan, bersih, tenang. Background off-white (#F6F8F7), white cards, forest green (#194C40) sebagai warna utama, accent warm gold (#D6A36B), typography Plus Jakarta Sans untuk heading dan DM Sans untuk body. Ruang putih, garis tipis, radius 10–16 px, shadow sangat ringan.

**Tata letak:** sidebar desktop; topbar search + notifikasi; header dan kartu responsif; mobile drawer dengan backdrop; tabel memiliki scroll horizontal; target sentuh ideal ≥ 44 × 44 px untuk tombol utama.

**Animasi:** page entrance opacity + 8–16 px translate (200–450 ms), hover cards translateY -3 s.d. -5 px (150–230 ms), progress/count-up dashboard (600–850 ms), garis tren SVG draw (1–1,5 s), ilustrasi orbit ambient (4–12 detik). Jangan pakai animasi tak terkendali pada elemen kritis; sediakan CSS `prefers-reduced-motion: reduce`. Animasi tidak boleh menghalangi input/pencarian/pengunggahan.

**Aksesibilitas:** landmark HTML, label form, focus-visible, navigasi keyboard, kontras teks WCAG AA untuk teks inti, dialog dapat ditutup ESC, indikator status tidak hanya mengandalkan warna, responsif dari 360 px.

**Prototype UI:** dashboard beranimasi, navigasi 6 halaman, pencarian global, pemilahan dokumen, detail indikator, dialog berkas, upload file sesi lokal **bukan** upload sebenarnya. Seed data simulasi harus jelas diberi label.

## 10. Arsitektur teknis

**Frontend:** React + TypeScript + Vite, build statis Netlify. UI menampilkan data via Supabase atau API yang terotorisasi. **Backend:** Netlify Functions (TypeScript) untuk otorisasi operasi Drive dan bisnis yang tidak boleh ada di browser. **Data:** Supabase Auth + PostgreSQL RLS. **Storage:** Gmail arsip khusus kantor + Drive API. Refresh token hanya di secret backend.

**Google OAuth:** sekali dihubungkan oleh pengelola akun arsip. Usulkan scope minimal `drive.file`; buat folder root dan subfolder dari aplikasi. Tinjau lebih dulu consent screen, status publishing, scope, verifikasi, risiko masa berlaku refresh token dan prosedur re-auth. OAuth Consent Screen status Testing untuk pengguna eksternal dapat menghasilkan refresh token yang berakhir setelah 7 hari.

**Netlify + upload:** batas buffered request/response sekitar 6 MB (efektif berkurang untuk base64). Upload 10 MiB melalui sesi Drive resumable dan chunks 1 MiB, diteruskan secara berurutan lewat API yang memverifikasi JWT, kepemilikan sesi, byte offset, MIME, ukuran, dan folder ID dari allowlist. `Content-Range` dari Drive menentukan offset sukses; jangan hanya mengandalkan urutan browser. Simpan session URL terenkripsi, bukan di klien; uji fungsi stateless, race condition, timeout, rate limit, dan retry sebelum produksi.

**Download:** endpoint backend dengan JWT+ACL, tanpa public sharing. Stream berkas sesuai limit platform; tangani file terhapus atau ID yang tidak cocok. **Observabilitas:** log request, error Drive API, unsuccessful uploads, quota, file orphan, histori verifikasi.

**Peringatan tata kelola:** akun Gmail consumer memiliki keterbatasan kepemilikan dan pemulihan. Pastikan akun resmi dikuasai kantor, 2FA, recovery dan backup terpisah. Arsip yang dibatasi/berisi data personal hanya digunakan setelah persetujuan penempatan data oleh penanggung jawab keamanan/TI kantor.

## 11. Konsep model data

| Tabel | Inti data dan relasi |
|---|---|
| `profiles` | user id auth, nama, role, aktif |
| `indicators` | 7 master, definisi/rumus, unit, mode |
| `indicator_assignments` | user id, indicator id, permission |
| `ki_records` | indikator, nama, status bisnis, wilayah, tahun, referensi, `attributes_jsonb`, workflow state |
| `indicator_snapshots` | indikator, periode, nilai, sumber, mode, reviewer, status |
| `documents` | judul, MIME, ukuran, Drive file id, klasifikasi, owner, checksum, status |
| `document_links` | relasi dokumen ke record/indikator/kegiatan, tanpa salinan file |
| `events` / `speakers` | kegiatan, tanggal, lokasi, narasumber dan materi terkait (bisa P1) |
| `content_pages` | konten edukasi 7 indikator, versi, status publish |
| `applications` | nama, deskripsi, URL tervalidasi, pengurutan, aktif |
| `upload_sessions` | owner, kategori, expected size, verified offset, encrypted session ref, expiry, state |
| `audit_logs` | actor, action, object, time, event payload yang disanitasi |

**Disarankan:** constraint unik internal berdasarkan indikator + nomor referensi normalisasi, indeks pada status/indikator/wilayah/tahun, foreign key on-delete policy, soft delete bagi record/dokumen, audit append-only. JSONB khusus atribut tetap tervalidasi pada backend atau schema JSON agar tidak menjadi data bebas yang inkonsisten.

**RLS:** default deny; kebijakan terpisah untuk SELECT/INSERT/UPDATE/DELETE. Uji negatif untuk anon, pimpinan, staf tanpa assignment, staf dengan assignment, admin. Jangan taruh service role key pada frontend.

## 12. Migrasi dari Google Apps Script

**Sumber lama:** PENGGUNA, AKSES_INDIKATOR, INDIKATOR, DOKUMEN_INDIKATOR, KONTEN, APLIKASI, LOG_AKTIVITAS. Sebelumnya disebut “6 tabel”, tetapi daftar aktual memuat **7 tab**; inventaris file Sheets menjadi sumber final.

1. Inventaris schema/field unik, hubungan Drive root, pemilik folder, izin, duplikasi, data kosong.
2. Mapping per tab ke tabel baru; tentukan siapa yang menandai data verified dan definisi hitung tiap indikator.
3. Backup spreadsheet dan Drive sebelum impor. Jalankan dry-run ke staging; simpan mapping `legacy_id` → `new_id`.
4. Auth lama SHA-256+salt tidak diimpor sebagai password Supabase. Buat akun baru/invite atau reset password terkontrol. Akun non-Workspace bisa login email/password.
5. Impor katalog konten, assignment, metadata dokumen, audit yang relevan; link hanya jika Drive API punya izin file tersebut.
6. Rekonsiliasi total per indikator, dokumen aktif, label, bukti, serta hak akses; verifikasi sampel oleh pemilik proses.
7. Freeze window, cut-over, rollback plan ke baca-saja jika validasi gagal. Hindari dual-write berkepanjangan.

## 13. Risiko utama dan mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Gmail consumer akun terkunci atau pegawai pemilik keluar | Arsip tidak tersedia | Akun dikuasai instansi, 2FA, recovery resmi, export/backup berkala |
| Consent OAuth masih Testing, token berumur pendek | Integrasi putus | Verifikasi & publishing flow sebelum go-live, pantau token dan reconnect |
| Upload 10 MiB melewati batas Function | Upload gagal | Chunk 1 MiB + resumable proxy; PoC beban/timeout; fallback streaming service |
| Statistik angka file ≠ angka entitas | Pimpinan memperoleh jawaban salah | Hitung dari record terverifikasi dan snapshot bersumber |
| File bocor lewat link Drive | Paparan dokumen internal | Sharing privat, proxy download, RLS+API ACL, audit, pelatihan |
| Admin langsung mengubah file di Drive | Database tak konsisten | Rekonsiliasi periodik dan deteksi orphan/absent files |
| Data sensitif disimpan pada consumer cloud | Risiko kepatuhan | Review legal/TI, data classification, ketentuan penyimpanan resmi |
| Definisi 7 indikator tidak seragam | Hasil hitung membingungkan | Workshop pemilik indikator; kamus data dan aturan per kategori |

## 14. Tahap delivery & gerbang go-live

**Sprint 0 (1–2 minggu):** discovery, definisi statistik, aturan klasifikasi dokumen, persetujuan arsip Gmail, PoC OAuth + resumable upload/download 10 MiB. *Gate:* upload/retry dan hak akses terbukti bekerja.

**Sprint 1:** auth, model data, RLS, assignment, kerangka UI responsif, CMS dasar. *Gate:* tes deny/allow lulus.

**Sprint 2:** dashboard, detail 7 indikator, entitas, filter dan workflow verifikasi. *Gate:* angka dashboard dapat direkonsiliasi ke daftar terverifikasi.

**Sprint 3:** pusat dokumen, kategori, relasi, upload/download, search, audit. *Gate:* 10 MiB + retry + expired session + permission deny teruji.

**Sprint 4:** migrasi, UAT staf/pimpinan, performa, keamanan, backup/restore dan pelatihan. *Gate:* persetujuan owner data, TI, dan pimpinan; rollback diuji.

Jadwal masih estimasi dan tergantung jumlah developer, kualitas data Sheets/Drive, kebijakan TI, dan proses OAuth.

## 15. Pertanyaan bisnis yang harus diputuskan sebelum produksi

1. Definisi resmi dan sumber valid untuk tiap 7 indikator: tercatat, terdaftar, terbit, diajukan, atau aktif?
2. Siapa pejabat/petugas yang berwenang memverifikasi setiap indikator dan angka manual?
3. Dokumen mana yang boleh dibaca semua staf, pimpinan, hanya pengelola, atau rahasia?
4. Apakah kantor mengizinkan akun Gmail consumer sebagai lokasi simpan dokumen yang dipilih?
5. Apakah registrasi login wajib username saja atau email/password dapat diterima?
6. Haruskah dokumen sambutan diorganisasi per acara, tanggal, narasumber, dan unit kerja?
7. Apakah angka tren historis tersedia, atau perlu mulai dicatat per bulan dari awal aplikasi baru?

## 16. Definition of Done (DoD)

Sebuah modul dinyatakan selesai hanya apabila: alur happy/negative path diuji; permission diuji di database dan API; UI responsif dan keyboard dapat dipakai; error/empty/loading state ada; audit tercatat sesuai klasifikasi; tidak ada kredensial dalam client; ada dokumentasi deploy dan recovery; dan pemilik proses menyetujui data yang ditampilkan. Prototype statis hanya memenuhi sebagian aspek tampilan/interaksi, bukan DoD produksi.

---

## Lampiran A — Katalog data minimal untuk 7 indikator

| Indikator | Data minimum entitas | Sumber angka akhir |
|---|---|---|
| Sentra KI | Nama, instansi, wilayah, tanggal pembentukan, status | Record aktif/terverifikasi sesuai definisi |
| IG | Nama produk, wilayah asal, pemegang, nomor registrasi, status | IG yang memenuhi status registrasi |
| KIK | Nama, jenis, komunitas, kabupaten/kota, nomor/tanggal pencatatan, status | KIK tercatat terverifikasi |
| Perda KI | Nama, nomor, tahun, wilayah, status keberlakuan | Perda yang berlaku sesuai cakupan |
| Paten | Judul invensi, inventor/pemohon, nomor, tahun, status | Paten yang memenuhi definisi terbit/terdaftar |
| Merek Kolektif | Nama merek, pemilik, kelompok, wilayah, status | Merek memenuhi status registrasi |
| Merek Kolektif KDMP | Nama merek, koperasi, desa/kelurahan, status | Merek terverifikasi terkait KDMP |

## Lampiran B — Rujukan teknis (diakses saat penyusunan)

- Google Drive API, *Upload file data*: https://developers.google.com/workspace/drive/api/guides/manage-uploads
- Google Drive API, *Choose API scopes*: https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- Google Identity, *Using OAuth 2.0 to Access Google APIs*: https://developers.google.com/identity/protocols/oauth2
- Netlify Docs, *Configuration for functions*: https://docs.netlify.com/build/functions/configuration/
- Supabase Docs, *Row Level Security*: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Docs, *Password-based Auth*: https://supabase.com/docs/guides/auth/passwords

*Dokumen kerja ini bukan persetujuan kebijakan legal, keamanan informasi, atau ketentuan penyimpanan data dari instansi.*
