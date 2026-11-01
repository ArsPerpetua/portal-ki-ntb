import { Router } from 'express';
import { withCaller } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const auditLogsRouter = Router();
auditLogsRouter.use(requireAuth, requireRole('SUPERADMIN'));

auditLogsRouter.get('/', async (req, res) => {
  const caller = { uid: req.user!.sub, role: req.user!.role };
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const rows = await withCaller(caller, async (client) => {
    const { rows } = await client.query(
      `SELECT a.id, a.action, a.object_type, a.object_id, a.metadata, a.created_at, p.full_name AS actor_name, p.role AS actor_role
       FROM audit_logs a LEFT JOIN profiles p ON p.id = a.actor_id
       ORDER BY a.created_at DESC LIMIT $1`,
      [limit],
    );
    return rows;
  });
  res.json({ logs: rows });
});
