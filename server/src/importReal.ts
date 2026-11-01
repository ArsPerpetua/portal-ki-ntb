import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Client } from 'pg';
import { env } from './env.js';
import { pgSslConfig } from './pgSsl.js';

// Import data riil (bukan contoh) ke ki_records, bersumber dari:
//  - server/db/seed-data/kik.json      <- diekstrak dari /kik/*.xlsx (Pangkalan Data KIK DJKI)
//  - server/db/seed-data/sentra.json   <- diekstrak dari /sentraki/Perguruan Tinggi NTB New.xlsx
//  - MEREK_KOLEKTIF di bawah           <- dibaca manual dari /merekkolektif/*.pdf (sertifikat merek = VERIFIED/terbit, formulir/tanda terima = PENDING_REVIEW)
// Jalankan setelah `npm run migrate` dan `npm run seed` (butuh indikator & akun superadmin sudah ada).
// Idempotent: record dengan reference_no sama akan di-UPDATE, bukan dobel; record tanpa reference_no
// (Sentra KI) dicocokkan berdasarkan (indicator_id, name).

const __dirname = dirname(fileURLToPath(import.meta.url));

interface ImportRecord {
  name: string;
  district: string;
  year: number;
  status: 'DRAFT' | 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED' | 'ARCHIVED';
  description?: string | null;
  reference_no?: string | null;
  attributes: Record<string, unknown>;
}

function loadJson(file: string): ImportRecord[] {
  const raw = readFileSync(join(__dirname, '..', 'db', 'seed-data', file), 'utf-8');
  return JSON.parse(raw);
}

// Tiga permohonan Merek Kolektif KDMP, dibaca dari formulir permohonan merek (DJKI) di /merekkolektif.
const MEREK_KOLEKTIF: ImportRecord[] = [
  {
    name: 'TENUN SUKARARA',
    district: 'Kab. Lombok Tengah',
    year: 2026,
    status: 'VERIFIED',
    reference_no: 'KID2026031038',
    description: 'Merek kolektif TENUN SUKARARA — dimiliki oleh Koperasi Desa Merah Putih Sukarara Kecamatan Jonggat untuk produk kain tenun (Kelas 24). Telah terbit sertifikat merek IDM001476745 pada 8 Juli 2026.',
    attributes: {
      sumber: 'Sertifikat Merek (DJKI)',
      nomor_permohonan: 'KID2026031038',
      nomor_transaksi: 'IPT2026075055',
      nomor_pendaftaran: 'IDM001476745',
      tanggal_terbit_sertifikat: '2026-07-08',
      tipe_permohonan: 'Merek Kolektif',
      jenis_permohonan: 'Usaha Mikro dan Usaha Kecil',
      tipe_merek: 'Merek Kata dan Lukisan',
      kelas: 24,
      uraian_barang_jasa: 'Kain tenun, kain tenun ikat, dan kain tenun untuk bahan pakaian',
      nama_pemohon: 'Koperasi Desa Merah Putih Sukarara Kecamatan Jonggat',
      jenis_pemohon: 'Badan Hukum',
      alamat_pemohon: 'Aula Kantor Desa Sukarara, Kecamatan Jonggat',
      tanggal_penerimaan: '2026-04-09',
    },
  },
  {
    name: 'BEDA BELEKE DAYE',
    district: 'Kab. Lombok Tengah',
    year: 2026,
    status: 'VERIFIED',
    reference_no: 'KID2026031054',
    description: 'Merek kolektif BEDA BELEKE DAYE — dimiliki oleh Koperasi Desa Merah Putih Beleke Daye untuk produk anyaman/furnitur rotan (Kelas 20). Telah terbit sertifikat merek IDM001476744 pada 8 Juli 2026.',
    attributes: {
      sumber: 'Sertifikat Merek (DJKI)',
      nomor_permohonan: 'KID2026031054',
      nomor_transaksi: 'IPT2026075160',
      nomor_pendaftaran: 'IDM001476744',
      tanggal_terbit_sertifikat: '2026-07-08',
      tipe_permohonan: 'Merek Kolektif',
      jenis_permohonan: 'Usaha Mikro dan Usaha Kecil',
      tipe_merek: 'Merek Kata dan Lukisan',
      kelas: 20,
      uraian_barang_jasa: 'Rotan, furnitur rotan, dan produk anyaman rotan/bambu',
      nama_pemohon: 'Koperasi Desa Merah Putih Beleke Daye',
      jenis_pemohon: 'Badan Hukum',
      alamat_pemohon: 'Kantor Desa Beleke Daye, Kecamatan Praya Timur',
      tanggal_penerimaan: '2026-04-09',
    },
  },
  {
    name: 'DESA JERUK MANIS COLLECTIVE',
    district: 'Kab. Lombok Timur',
    year: 2026,
    status: 'PENDING_REVIEW',
    reference_no: 'KID2026097454',
    description: 'Merek kolektif DESA JERUK MANIS COLLECTIVE — diajukan oleh Koperasi Desa Merah Putih Jeruk Manis untuk produk olahan pangan (Kelas 29), masih dalam proses permohonan di DJKI.',
    attributes: {
      sumber: 'Formulir Permohonan Pendaftaran Merek Indonesia (DJKI)',
      nomor_permohonan: 'KID2026097454',
      nomor_transaksi: 'IPT2026228494',
      tipe_permohonan: 'Merek Kolektif',
      jenis_permohonan: 'Usaha Mikro dan Usaha Kecil',
      tipe_merek: 'Merek Kata dan Lukisan',
      kelas: 29,
      uraian_barang_jasa: 'Keripik pisang, keripik talas, keripik singkong, keripik tempe, jamur crispy, jajan komak',
      nama_pemohon: 'Koperasi Desa Merah Putih Jeruk Manis',
      jenis_pemohon: 'Badan Hukum',
      alamat_pemohon: 'Desa Jeruk Manis, Kecamatan Sikur',
      tanggal_penerimaan: '2026-09-15',
    },
  },
];

async function upsertByReferenceNo(db: Client, indicatorId: string, creatorId: string, superadminId: string, records: ImportRecord[]) {
  let inserted = 0;
  for (const r of records) {
    const verified = r.status === 'VERIFIED';
    const { rows } = await db.query<{ inserted: boolean }>(
      `INSERT INTO ki_records (indicator_id, name, district, year, reference_no, status, description, attributes, created_by, verified_by, verified_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (indicator_id, reference_no) WHERE reference_no IS NOT NULL DO UPDATE SET
         name = EXCLUDED.name, district = EXCLUDED.district, year = EXCLUDED.year,
         status = EXCLUDED.status, description = EXCLUDED.description, attributes = EXCLUDED.attributes,
         verified_by = EXCLUDED.verified_by, verified_at = EXCLUDED.verified_at
       RETURNING (xmax = 0) AS inserted`,
      [indicatorId, r.name, r.district, r.year, r.reference_no ?? null, r.status, r.description ?? null,
        JSON.stringify(r.attributes), creatorId, verified ? superadminId : null, verified ? new Date() : null],
    );
    if (rows[0]?.inserted) inserted += 1;
  }
  return { inserted };
}

async function upsertByName(db: Client, indicatorId: string, creatorId: string, superadminId: string, records: ImportRecord[]) {
  let inserted = 0;
  let updated = 0;
  for (const r of records) {
    const verified = r.status === 'VERIFIED';
    const existing = await db.query('SELECT id FROM ki_records WHERE indicator_id = $1 AND name = $2 AND district = $3', [indicatorId, r.name, r.district]);
    if (existing.rowCount && existing.rowCount > 0) {
      await db.query(
        `UPDATE ki_records SET year = $1, status = $2, description = $3, attributes = $4,
           verified_by = $5, verified_at = $6
         WHERE id = $7`,
        [r.year, r.status, r.description ?? null, JSON.stringify(r.attributes),
          verified ? superadminId : null, verified ? new Date() : null, existing.rows[0].id],
      );
      updated += 1;
      continue;
    }
    await db.query(
      `INSERT INTO ki_records (indicator_id, name, district, year, status, description, attributes, created_by, verified_by, verified_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [indicatorId, r.name, r.district, r.year, r.status, r.description ?? null,
        JSON.stringify(r.attributes), creatorId, verified ? superadminId : null, verified ? new Date() : null],
    );
    inserted += 1;
  }
  return { inserted, updated };
}

async function run() {
  const db = new Client({
    host: env.pgAdmin.host,
    port: env.pgAdmin.port,
    user: env.pgAdmin.user,
    password: env.pgAdmin.password,
    database: env.pgAdmin.database,
    ssl: pgSslConfig(),
  });
  await db.connect();

  const { rows: indicatorRows } = await db.query<{ code: string; id: string }>(
    `SELECT code, id FROM indicators WHERE code IN ('kik','kdmp','sentra')`,
  );
  const indicatorIds = Object.fromEntries(indicatorRows.map((r) => [r.code, r.id]));
  for (const code of ['kik', 'kdmp', 'sentra']) {
    if (!indicatorIds[code]) {
      throw new Error(`Indikator '${code}' belum ada. Jalankan 'npm run seed' lebih dulu.`);
    }
  }

  const { rows: adminRows } = await db.query<{ id: string }>(
    `SELECT id FROM profiles WHERE email = 'superadmin@portalki.ntb.go.id'`,
  );
  if (!adminRows[0]) {
    throw new Error(`Akun superadmin@portalki.ntb.go.id belum ada. Jalankan 'npm run seed' lebih dulu.`);
  }
  const superadminId = adminRows[0].id;

  console.log('Mengimpor data KIK riil (kik/*.xlsx)...');
  const kikRecords = loadJson('kik.json');
  const kikResult = await upsertByReferenceNo(db, indicatorIds.kik, superadminId, superadminId, kikRecords);
  console.log(`  ${kikRecords.length} baris diproses (${kikResult.inserted} baru).`);

  console.log('Mengimpor data Merek Kolektif KDMP riil (merekkolektif/*.pdf)...');
  const kdmpResult = await upsertByReferenceNo(db, indicatorIds.kdmp, superadminId, superadminId, MEREK_KOLEKTIF);
  console.log(`  ${MEREK_KOLEKTIF.length} baris diproses (${kdmpResult.inserted} baru).`);

  console.log('Mengimpor data Sentra KI riil (sentraki/*.xlsx)...');
  const sentraRecords = loadJson('sentra.json');
  const sentraResult = await upsertByName(db, indicatorIds.sentra, superadminId, superadminId, sentraRecords);
  console.log(`  ${sentraRecords.length} baris diproses (${sentraResult.inserted} baru, ${sentraResult.updated} diperbarui).`);

  await db.end();
  console.log('Import data riil selesai.');
}

run().catch((err) => {
  console.error('Import gagal:', err);
  process.exit(1);
});
