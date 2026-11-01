-- Portal Digital KI NTB — skema inti (local dev)
-- Meniru pola Supabase: role aplikasi non-superuser + Row Level Security default-deny.

-- 1) Role aplikasi (dipakai oleh backend API, BUKAN superuser, sehingga RLS berlaku)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app') THEN
    CREATE ROLE portal_app LOGIN PASSWORD '__PORTAL_APP_PASSWORD__' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
END $$;

GRANT CONNECT ON DATABASE __DATABASE_NAME__ TO portal_app;
GRANT USAGE ON SCHEMA public TO portal_app;

-- 2) Helper: identitas pemanggil saat ini, diset oleh backend via SET LOCAL per request
CREATE OR REPLACE FUNCTION app_current_uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.uid', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION app_current_role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.role', true), '');
$$;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 3) Tabel inti

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('SUPERADMIN','STAF','PIMPINAN')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS indicators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  short_name text NOT NULL,
  unit text NOT NULL,
  counting_definition text NOT NULL,
  counting_statuses text[] NOT NULL DEFAULT ARRAY['VERIFIED'],
  mode text NOT NULL DEFAULT 'DERIVED' CHECK (mode IN ('DERIVED','MANUAL')),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS indicator_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  indicator_id uuid NOT NULL REFERENCES indicators(id) ON DELETE CASCADE,
  can_write boolean NOT NULL DEFAULT true,
  can_verify boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, indicator_id)
);

CREATE TABLE IF NOT EXISTS ki_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_id uuid NOT NULL REFERENCES indicators(id) ON DELETE RESTRICT,
  name text NOT NULL,
  district text NOT NULL,
  year int NOT NULL,
  reference_no text,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PENDING_REVIEW','VERIFIED','REJECTED','ARCHIVED')),
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  rejection_reason text,
  created_by uuid REFERENCES profiles(id),
  verified_by uuid REFERENCES profiles(id),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ki_records_indicator_refno_uq
  ON ki_records (indicator_id, reference_no) WHERE reference_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS ki_records_indicator_status_idx ON ki_records (indicator_id, status);
CREATE INDEX IF NOT EXISTS ki_records_district_year_idx ON ki_records (district, year);
DROP TRIGGER IF EXISTS trg_ki_records_updated_at ON ki_records;
CREATE TRIGGER trg_ki_records_updated_at BEFORE UPDATE ON ki_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS indicator_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_id uuid NOT NULL REFERENCES indicators(id) ON DELETE CASCADE,
  period text NOT NULL,
  value numeric NOT NULL,
  unit text,
  source text NOT NULL,
  reason text,
  input_by uuid REFERENCES profiles(id),
  verified_by uuid REFERENCES profiles(id),
  status text NOT NULL DEFAULT 'PENDING_REVIEW' CHECK (status IN ('PENDING_REVIEW','VERIFIED','REJECTED')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL CHECK (category IN ('Sambutan','Materi Narasumber','Dokumen Pendukung','Referensi')),
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  storage_key text NOT NULL,
  checksum text,
  classification text NOT NULL DEFAULT 'INTERNAL' CHECK (classification IN ('INTERNAL','RESTRICTED')),
  owner_id uuid REFERENCES profiles(id),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED','DELETED')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS documents_category_idx ON documents (category);

CREATE TABLE IF NOT EXISTS document_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  indicator_id uuid REFERENCES indicators(id) ON DELETE SET NULL,
  ki_record_id uuid REFERENCES ki_records(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS document_links_indicator_idx ON document_links (indicator_id);

CREATE TABLE IF NOT EXISTS content_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_id uuid NOT NULL REFERENCES indicators(id) ON DELETE CASCADE UNIQUE,
  body_md text NOT NULL,
  status text NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('DRAFT','PUBLISHED')),
  updated_by uuid REFERENCES profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_content_pages_updated_at ON content_pages;
CREATE TRIGGER trg_content_pages_updated_at BEFORE UPDATE ON content_pages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL,
  url text NOT NULL,
  icon text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES profiles(id),
  action text NOT NULL,
  object_type text NOT NULL,
  object_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs (created_at DESC);

-- 4) Grants dasar untuk role aplikasi (RLS membatasi baris, grant ini hanya membatasi tabel/aksi)
GRANT SELECT, INSERT, UPDATE ON profiles, indicators, indicator_assignments, ki_records,
  indicator_snapshots, documents, document_links, content_pages, applications TO portal_app;
GRANT SELECT, INSERT ON audit_logs TO portal_app;
GRANT DELETE ON indicator_assignments, document_links TO portal_app;

-- 5) Row Level Security — default deny, lalu policy eksplisit per aksi
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY; ALTER TABLE profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE indicators ENABLE ROW LEVEL SECURITY; ALTER TABLE indicators FORCE ROW LEVEL SECURITY;
ALTER TABLE indicator_assignments ENABLE ROW LEVEL SECURITY; ALTER TABLE indicator_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE ki_records ENABLE ROW LEVEL SECURITY; ALTER TABLE ki_records FORCE ROW LEVEL SECURITY;
ALTER TABLE indicator_snapshots ENABLE ROW LEVEL SECURITY; ALTER TABLE indicator_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY; ALTER TABLE documents FORCE ROW LEVEL SECURITY;
ALTER TABLE document_links ENABLE ROW LEVEL SECURITY; ALTER TABLE document_links FORCE ROW LEVEL SECURITY;
ALTER TABLE content_pages ENABLE ROW LEVEL SECURITY; ALTER TABLE content_pages FORCE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY; ALTER TABLE applications FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY; ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

-- profiles: lihat diri sendiri atau semua jika SUPERADMIN; tulis hanya SUPERADMIN
DROP POLICY IF EXISTS profiles_select ON profiles;
CREATE POLICY profiles_select ON profiles FOR SELECT
  USING (app_current_role() = 'SUPERADMIN' OR id = app_current_uid());
DROP POLICY IF EXISTS profiles_write ON profiles;
CREATE POLICY profiles_write ON profiles FOR INSERT WITH CHECK (app_current_role() = 'SUPERADMIN');
DROP POLICY IF EXISTS profiles_update ON profiles;
CREATE POLICY profiles_update ON profiles FOR UPDATE
  USING (app_current_role() = 'SUPERADMIN' OR id = app_current_uid())
  WITH CHECK (app_current_role() = 'SUPERADMIN' OR id = app_current_uid());

-- indicators: baca untuk siapapun yang login; tulis hanya SUPERADMIN
DROP POLICY IF EXISTS indicators_select ON indicators;
CREATE POLICY indicators_select ON indicators FOR SELECT USING (app_current_uid() IS NOT NULL);
DROP POLICY IF EXISTS indicators_write ON indicators;
CREATE POLICY indicators_write ON indicators FOR INSERT WITH CHECK (app_current_role() = 'SUPERADMIN');
DROP POLICY IF EXISTS indicators_update ON indicators;
CREATE POLICY indicators_update ON indicators FOR UPDATE
  USING (app_current_role() = 'SUPERADMIN') WITH CHECK (app_current_role() = 'SUPERADMIN');

-- indicator_assignments: admin lihat semua; staf lihat miliknya sendiri; tulis hanya admin
DROP POLICY IF EXISTS assignments_select ON indicator_assignments;
CREATE POLICY assignments_select ON indicator_assignments FOR SELECT
  USING (app_current_role() = 'SUPERADMIN' OR user_id = app_current_uid());
DROP POLICY IF EXISTS assignments_write ON indicator_assignments;
CREATE POLICY assignments_write ON indicator_assignments FOR INSERT WITH CHECK (app_current_role() = 'SUPERADMIN');
DROP POLICY IF EXISTS assignments_update ON indicator_assignments;
CREATE POLICY assignments_update ON indicator_assignments FOR UPDATE
  USING (app_current_role() = 'SUPERADMIN') WITH CHECK (app_current_role() = 'SUPERADMIN');
DROP POLICY IF EXISTS assignments_delete ON indicator_assignments;
CREATE POLICY assignments_delete ON indicator_assignments FOR DELETE USING (app_current_role() = 'SUPERADMIN');

-- ki_records:
--  SELECT: record VERIFIED terlihat semua yang login (angka resmi dashboard/direktori);
--          DRAFT/PENDING_REVIEW/REJECTED hanya terlihat bagi pembuat, staf assigned indikator, atau SUPERADMIN
--  INSERT: STAF dengan assignment can_write, atau SUPERADMIN
--  UPDATE: SUPERADMIN; STAF dengan assignment can_write pada indikator terkait (verifikasi divalidasi lagi di aplikasi)
--  DELETE: tidak ada (gunakan status ARCHIVED lewat UPDATE)
DROP POLICY IF EXISTS ki_records_select ON ki_records;
CREATE POLICY ki_records_select ON ki_records FOR SELECT
  USING (
    (status = 'VERIFIED' AND app_current_uid() IS NOT NULL)
    OR app_current_role() = 'SUPERADMIN'
    OR created_by = app_current_uid()
    OR EXISTS (
      SELECT 1 FROM indicator_assignments a
      WHERE a.indicator_id = ki_records.indicator_id AND a.user_id = app_current_uid()
    )
  );
DROP POLICY IF EXISTS ki_records_insert ON ki_records;
CREATE POLICY ki_records_insert ON ki_records FOR INSERT WITH CHECK (
  app_current_role() = 'SUPERADMIN'
  OR EXISTS (
    SELECT 1 FROM indicator_assignments a
    WHERE a.indicator_id = ki_records.indicator_id AND a.user_id = app_current_uid() AND a.can_write
  )
);
DROP POLICY IF EXISTS ki_records_update ON ki_records;
CREATE POLICY ki_records_update ON ki_records FOR UPDATE
  USING (
    app_current_role() = 'SUPERADMIN'
    OR EXISTS (
      SELECT 1 FROM indicator_assignments a
      WHERE a.indicator_id = ki_records.indicator_id AND a.user_id = app_current_uid() AND a.can_write
    )
  )
  WITH CHECK (
    app_current_role() = 'SUPERADMIN'
    OR EXISTS (
      SELECT 1 FROM indicator_assignments a
      WHERE a.indicator_id = ki_records.indicator_id AND a.user_id = app_current_uid() AND a.can_write
    )
  );

-- indicator_snapshots: baca untuk login (angka VERIFIED saja bagi non-admin); tulis oleh yang punya can_write
DROP POLICY IF EXISTS snapshots_select ON indicator_snapshots;
CREATE POLICY snapshots_select ON indicator_snapshots FOR SELECT
  USING (
    app_current_role() = 'SUPERADMIN'
    OR status = 'VERIFIED'
    OR input_by = app_current_uid()
  );
DROP POLICY IF EXISTS snapshots_insert ON indicator_snapshots;
CREATE POLICY snapshots_insert ON indicator_snapshots FOR INSERT WITH CHECK (
  app_current_role() = 'SUPERADMIN'
  OR EXISTS (
    SELECT 1 FROM indicator_assignments a
    WHERE a.indicator_id = indicator_snapshots.indicator_id AND a.user_id = app_current_uid() AND a.can_write
  )
);
DROP POLICY IF EXISTS snapshots_update ON indicator_snapshots;
CREATE POLICY snapshots_update ON indicator_snapshots FOR UPDATE
  USING (app_current_role() = 'SUPERADMIN')
  WITH CHECK (app_current_role() = 'SUPERADMIN');

-- documents: INTERNAL terlihat semua yang login; RESTRICTED hanya admin/pemilik; tulis oleh STAF/SUPERADMIN
DROP POLICY IF EXISTS documents_select ON documents;
CREATE POLICY documents_select ON documents FOR SELECT
  USING (
    app_current_role() = 'SUPERADMIN'
    OR owner_id = app_current_uid()
    OR (classification = 'INTERNAL' AND app_current_uid() IS NOT NULL)
  );
DROP POLICY IF EXISTS documents_insert ON documents;
CREATE POLICY documents_insert ON documents FOR INSERT WITH CHECK (
  app_current_role() IN ('SUPERADMIN','STAF')
);
DROP POLICY IF EXISTS documents_update ON documents;
CREATE POLICY documents_update ON documents FOR UPDATE
  USING (app_current_role() = 'SUPERADMIN' OR owner_id = app_current_uid())
  WITH CHECK (app_current_role() = 'SUPERADMIN' OR owner_id = app_current_uid());

-- document_links: ikut visibilitas dokumen induk
DROP POLICY IF EXISTS document_links_select ON document_links;
CREATE POLICY document_links_select ON document_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM documents d WHERE d.id = document_links.document_id
      AND (
        app_current_role() = 'SUPERADMIN'
        OR d.owner_id = app_current_uid()
        OR (d.classification = 'INTERNAL' AND app_current_uid() IS NOT NULL)
      )
    )
  );
DROP POLICY IF EXISTS document_links_insert ON document_links;
CREATE POLICY document_links_insert ON document_links FOR INSERT WITH CHECK (
  app_current_role() IN ('SUPERADMIN','STAF')
);
DROP POLICY IF EXISTS document_links_delete ON document_links;
CREATE POLICY document_links_delete ON document_links FOR DELETE USING (
  app_current_role() = 'SUPERADMIN'
  OR EXISTS (SELECT 1 FROM documents d WHERE d.id = document_links.document_id AND d.owner_id = app_current_uid())
);

-- content_pages: PUBLISHED terlihat semua yang login; DRAFT hanya admin; tulis hanya admin
DROP POLICY IF EXISTS content_pages_select ON content_pages;
CREATE POLICY content_pages_select ON content_pages FOR SELECT
  USING (status = 'PUBLISHED' OR app_current_role() = 'SUPERADMIN');
DROP POLICY IF EXISTS content_pages_insert ON content_pages;
CREATE POLICY content_pages_insert ON content_pages FOR INSERT WITH CHECK (app_current_role() = 'SUPERADMIN');
DROP POLICY IF EXISTS content_pages_update ON content_pages;
CREATE POLICY content_pages_update ON content_pages FOR UPDATE
  USING (app_current_role() = 'SUPERADMIN') WITH CHECK (app_current_role() = 'SUPERADMIN');

-- applications: aktif terlihat semua yang login; tulis hanya admin
DROP POLICY IF EXISTS applications_select ON applications;
CREATE POLICY applications_select ON applications FOR SELECT
  USING (is_active OR app_current_role() = 'SUPERADMIN');
DROP POLICY IF EXISTS applications_insert ON applications;
CREATE POLICY applications_insert ON applications FOR INSERT WITH CHECK (app_current_role() = 'SUPERADMIN');
DROP POLICY IF EXISTS applications_update ON applications;
CREATE POLICY applications_update ON applications FOR UPDATE
  USING (app_current_role() = 'SUPERADMIN') WITH CHECK (app_current_role() = 'SUPERADMIN');

-- audit_logs: hanya SUPERADMIN dapat membaca; insert oleh siapapun login atas nama dirinya (append-only, tanpa update/delete)
DROP POLICY IF EXISTS audit_logs_select ON audit_logs;
CREATE POLICY audit_logs_select ON audit_logs FOR SELECT USING (app_current_role() = 'SUPERADMIN');
DROP POLICY IF EXISTS audit_logs_insert ON audit_logs;
CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT WITH CHECK (
  actor_id = app_current_uid() OR actor_id IS NULL
);
