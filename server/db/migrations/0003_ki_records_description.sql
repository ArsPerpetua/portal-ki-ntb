-- Deskripsi singkat per entitas KI, ditampilkan di modal detail entitas.
ALTER TABLE ki_records ADD COLUMN IF NOT EXISTS description text;
