-- Fitur detail entitas perlu menampilkan nama pembuat/verifikator ke siapapun yang berhak
-- melihat record tersebut (bukan hanya SUPERADMIN atau diri sendiri seperti semula).
-- password_hash TETAP tidak pernah bisa dibaca oleh role aplikasi — dicabut di level kolom,
-- bukan hanya dibatasi lewat RLS, supaya aman walau ada query "SELECT *" yang ceroboh di masa depan.

REVOKE SELECT ON profiles FROM portal_app;
GRANT SELECT (id, email, full_name, role, is_active, created_at) ON profiles TO portal_app;

DROP POLICY IF EXISTS profiles_select ON profiles;
CREATE POLICY profiles_select ON profiles FOR SELECT
  USING (app_current_uid() IS NOT NULL);
