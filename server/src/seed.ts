import { Client } from 'pg';
import { env } from './env.js';
import { hashPassword } from './auth.js';
import { pgSslConfig } from './pgSsl.js';

interface IndicatorSeed {
  code: string;
  name: string;
  shortName: string;
  unit: string;
  countingDefinition: string;
  bodyMd: string;
  sortOrder: number;
  manualValue?: number;
}

const INDICATORS: IndicatorSeed[] = [
  { code: 'sentra', name: 'Sentra Kekayaan Intelektual', shortName: 'Sentra KI', unit: 'sentra', sortOrder: 1,
    countingDefinition: 'Record aktif/terverifikasi sesuai definisi Sentra KI.',
    bodyMd: 'Unit atau pusat layanan yang mendukung edukasi, fasilitasi, dan pengelolaan kekayaan intelektual.' },
  { code: 'ig', name: 'Indikasi Geografis', shortName: 'IG', unit: 'produk', sortOrder: 2,
    countingDefinition: 'IG yang memenuhi status registrasi.',
    bodyMd: 'Tanda yang menunjukkan daerah asal suatu barang atau produk karena faktor lingkungan geografis dan karakteristik tertentu.',
    manualValue: 10 },
  { code: 'kik', name: 'Kekayaan Intelektual Komunal', shortName: 'KIK', unit: 'pencatatan', sortOrder: 3,
    countingDefinition: 'KIK tercatat terverifikasi.',
    bodyMd: 'Pengetahuan dan ekspresi kekayaan intelektual yang bersifat komunal, termasuk pengetahuan tradisional dan ekspresi budaya tradisional.' },
  { code: 'perda', name: 'Peraturan Daerah KI', shortName: 'Perda KI', unit: 'peraturan', sortOrder: 4,
    countingDefinition: 'Perda yang berlaku sesuai cakupan.',
    bodyMd: 'Peraturan daerah yang menjadi landasan tata kelola, pelindungan, dan pengembangan kekayaan intelektual.' },
  { code: 'paten', name: 'Paten', shortName: 'Paten', unit: 'paten', sortOrder: 5,
    countingDefinition: 'Paten yang memenuhi definisi terbit/terdaftar.',
    bodyMd: 'Hak eksklusif atas invensi di bidang teknologi yang memenuhi persyaratan menurut ketentuan hukum.',
    manualValue: 272 },
  { code: 'merek', name: 'Merek Kolektif', shortName: 'Merek Kolektif', unit: 'merek', sortOrder: 6,
    countingDefinition: 'Merek memenuhi status registrasi.',
    bodyMd: 'Merek yang dipakai bersama oleh beberapa orang atau badan hukum dengan karakteristik dan mutu yang sama.' },
  { code: 'kdmp', name: 'Merek Kolektif KDMP', shortName: 'MK KDMP', unit: 'merek', sortOrder: 7,
    countingDefinition: 'Merek terverifikasi terkait KDMP.',
    bodyMd: 'Pemantauan merek kolektif yang terkait dengan Koperasi Desa/Kelurahan Merah Putih (KDMP).' },
];
// ig & paten: belum ada data riil per-entitas, jadi manualValue dipakai sebagai angka sementara
// dari rekap nasional DJKI (Pangkalan Data KI, provinsi NTB) sampai data per-entitas diimpor.

// Catatan: tidak ada data contoh/simulasi di sini. 'kik', 'kdmp', dan 'sentra' diisi data riil
// lewat `npm run import:real` (lihat server/src/importReal.ts). Kategori 'ig', 'perda', 'paten',
// dan 'merek' dibiarkan kosong sampai data riil tersedia untuk diimpor.
const RECORD_SAMPLES: Record<string, { name: string; district: string; year: number; status: string; description: string }[]> = {};

const APPLICATIONS = [
  { name: 'Pangkalan Data KI', description: 'Pencarian dan penelusuran informasi kekayaan intelektual.', url: '#', iconKey: 'database', sortOrder: 1 },
  { name: 'Layanan Permohonan KI', description: 'Akses proses layanan dan pengajuan kekayaan intelektual.', url: '#', iconKey: 'briefcase', sortOrder: 2 },
  { name: 'Dashboard Pelaporan', description: 'Rekapitulasi dan ringkasan pelaksanaan kegiatan.', url: '#', iconKey: 'layout', sortOrder: 3 },
  { name: 'Referensi Hukum', description: 'Kumpulan rujukan dan bahan edukasi terkait KI.', url: '#', iconKey: 'book', sortOrder: 4 },
];

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

  console.log('Seeding profiles...');
  const users: { email: string; fullName: string; role: 'SUPERADMIN' | 'STAF' | 'PIMPINAN'; password: string }[] = [
    { email: 'superadmin@portalki.ntb.go.id', fullName: 'Admin Sistem', role: 'SUPERADMIN', password: env.seedPasswords.superadmin },
    { email: 'staf.kik@portalki.ntb.go.id', fullName: 'Staf Indikator KIK', role: 'STAF', password: env.seedPasswords.staf },
    { email: 'staf.ig@portalki.ntb.go.id', fullName: 'Staf Indikator IG', role: 'STAF', password: env.seedPasswords.staf },
    { email: 'pimpinan@portalki.ntb.go.id', fullName: 'Kepala Kantor Wilayah', role: 'PIMPINAN', password: env.seedPasswords.pimpinan },
  ];
  const userIds: Record<string, string> = {};
  for (const u of users) {
    const hash = await hashPassword(u.password);
    const { rows } = await db.query(
      `INSERT INTO profiles (email, password_hash, full_name, role)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, full_name = EXCLUDED.full_name, role = EXCLUDED.role
       RETURNING id`,
      [u.email, hash, u.fullName, u.role],
    );
    userIds[u.email] = rows[0].id;
  }

  console.log('Seeding indicators...');
  const indicatorIds: Record<string, string> = {};
  for (const ind of INDICATORS) {
    const { rows } = await db.query(
      `INSERT INTO indicators (code, name, short_name, unit, counting_definition, sort_order, manual_value, mode)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, short_name = EXCLUDED.short_name,
         unit = EXCLUDED.unit, counting_definition = EXCLUDED.counting_definition, sort_order = EXCLUDED.sort_order,
         manual_value = EXCLUDED.manual_value, mode = EXCLUDED.mode
       RETURNING id`,
      [ind.code, ind.name, ind.shortName, ind.unit, ind.countingDefinition, ind.sortOrder, ind.manualValue ?? null,
        ind.manualValue != null ? 'MANUAL' : 'DERIVED'],
    );
    indicatorIds[ind.code] = rows[0].id;

    await db.query(
      `INSERT INTO content_pages (indicator_id, body_md, status, updated_by)
       VALUES ($1,$2,'PUBLISHED',$3)
       ON CONFLICT (indicator_id) DO UPDATE SET body_md = EXCLUDED.body_md`,
      [indicatorIds[ind.code], ind.bodyMd, userIds['superadmin@portalki.ntb.go.id']],
    );
  }

  console.log('Seeding assignments...');
  await db.query(
    `INSERT INTO indicator_assignments (user_id, indicator_id, can_write, can_verify)
     VALUES ($1,$2,true,true)
     ON CONFLICT (user_id, indicator_id) DO UPDATE SET can_write = true, can_verify = true`,
    [userIds['staf.kik@portalki.ntb.go.id'], indicatorIds['kik']],
  );
  await db.query(
    `INSERT INTO indicator_assignments (user_id, indicator_id, can_write, can_verify)
     VALUES ($1,$2,true,false)
     ON CONFLICT (user_id, indicator_id) DO UPDATE SET can_write = true, can_verify = false`,
    [userIds['staf.ig@portalki.ntb.go.id'], indicatorIds['ig']],
  );

  console.log('Seeding ki_records (RECORD_SAMPLES kosong, dilewati)...');
  for (const [code, records] of Object.entries(RECORD_SAMPLES)) {
    const indicatorId = indicatorIds[code];
    const creator = code === 'kik'
      ? userIds['staf.kik@portalki.ntb.go.id']
      : code === 'ig'
        ? userIds['staf.ig@portalki.ntb.go.id']
        : userIds['superadmin@portalki.ntb.go.id'];
    for (const r of records) {
      const existing = await db.query(
        'SELECT id FROM ki_records WHERE indicator_id = $1 AND name = $2',
        [indicatorId, r.name],
      );
      if (existing.rowCount && existing.rowCount > 0) {
        await db.query('UPDATE ki_records SET description = $1 WHERE id = $2', [r.description, existing.rows[0].id]);
        continue;
      }
      const verified = r.status === 'VERIFIED';
      await db.query(
        `INSERT INTO ki_records (indicator_id, name, district, year, status, description, created_by, verified_by, verified_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [indicatorId, r.name, r.district, r.year, r.status, r.description, creator,
          verified ? userIds['superadmin@portalki.ntb.go.id'] : null,
          verified ? new Date() : null],
      );
    }
  }

  console.log('Seeding applications...');
  for (const app of APPLICATIONS) {
    const existing = await db.query('SELECT 1 FROM applications WHERE name = $1', [app.name]);
    if (existing.rowCount && existing.rowCount > 0) continue;
    await db.query(
      `INSERT INTO applications (name, description, url, icon, sort_order) VALUES ($1,$2,$3,$4,$5)`,
      [app.name, app.description, app.url, app.iconKey, app.sortOrder],
    );
  }

  console.log('Seeding audit_logs contoh...');
  await db.query(
    `INSERT INTO audit_logs (actor_id, action, object_type, metadata)
     VALUES ($1,'SEED_INIT','system','{"note":"Data awal pengembangan lokal"}')`,
    [userIds['superadmin@portalki.ntb.go.id']],
  );

  await db.end();
  console.log('Seed selesai.');
  console.log('\nAkun untuk login lokal:');
  for (const u of users) console.log(`  ${u.role.padEnd(10)} ${u.email}  /  ${u.password}`);
}

run().catch((err) => {
  console.error('Seed gagal:', err);
  process.exit(1);
});
