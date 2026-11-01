import { Router } from 'express';
import { withCaller } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

export const activityRouter = Router();
activityRouter.use(requireAuth);

// GET /api/activity — feed ringan untuk semua role (bukan audit log mentah; itu khusus SUPERADMIN di /api/audit-logs)
activityRouter.get('/', async (req, res) => {
  const caller = { uid: req.user!.sub, role: req.user!.role };
  const rows = await withCaller(caller, async (client) => {
    const { rows: records } = await client.query(`
      SELECT 'record' AS kind, r.id, r.name AS title, i.short_name AS context, r.status, r.verified_at AS at, r.created_at
      FROM ki_records r JOIN indicators i ON i.id = r.indicator_id
      WHERE r.status = 'VERIFIED'
      ORDER BY r.verified_at DESC LIMIT 6
    `);
    const { rows: docs } = await client.query(`
      SELECT 'document' AS kind, d.id, d.title, d.category AS context, d.status, NULL::timestamptz AS at, d.created_at
      FROM documents d WHERE d.status = 'ACTIVE'
      ORDER BY d.created_at DESC LIMIT 6
    `);
    return [...records, ...docs]
      .sort((a: any, b: any) => new Date(b.at ?? b.created_at).getTime() - new Date(a.at ?? a.created_at).getTime())
      .slice(0, 8);
  });
  res.json({ activity: rows });
});
