-- Angka manual untuk indikator yang belum punya data riil per-entitas (mode='MANUAL'),
-- dipakai sebagai pengganti sementara COUNT(ki_records) sampai data riil tersedia.
ALTER TABLE indicators ADD COLUMN IF NOT EXISTS manual_value int;
