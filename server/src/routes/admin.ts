import { Router } from 'express';
import { z } from 'zod';
import { withCaller } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { logAudit } from '../audit.js';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('SUPERADMIN'));

function callerOf(req: import('express').Request) {
  return { uid: req.user!.sub, role: req.user!.role };
}

adminRouter.get('/users', async (req, res) => {
  const caller = callerOf(req);
  const rows = await withCaller(caller, async (client) => {
    const { rows } = await client.query(
      'SELECT id, email, full_name, role, is_active, created_at FROM profiles ORDER BY created_at',
    );
    return rows;
  });
  res.json({ users: rows });
});

adminRouter.get('/assignments', async (req, res) => {
  const caller = callerOf(req);
  const rows = await withCaller(caller, async (client) => {
    const { rows } = await client.query(`
      SELECT a.id, a.user_id, p.full_name AS user_name, a.indicator_id, i.short_name AS indicator_name,
             a.can_write, a.can_verify
      FROM indicator_assignments a
      JOIN profiles p ON p.id = a.user_id
      JOIN indicators i ON i.id = a.indicator_id
      ORDER BY i.sort_order, p.full_name
    `);
    return rows;
  });
  res.json({ assignments: rows });
});

const assignSchema = z.object({
  userId: z.string().uuid(),
  indicatorCode: z.string(),
  canWrite: z.boolean().default(true),
  canVerify: z.boolean().default(false),
});

adminRouter.post('/assignments', async (req, res) => {
  const caller = callerOf(req);
  const parsed = assignSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Data penugasan tidak valid.' });
  const { userId, indicatorCode, canWrite, canVerify } = parsed.data;

  const result = await withCaller(caller, async (client) => {
    const { rows: indRows } = await client.query('SELECT id FROM indicators WHERE code = $1', [indicatorCode]);
    if (!indRows[0]) return null;
    const { rows } = await client.query(
      `INSERT INTO indicator_assignments (user_id, indicator_id, can_write, can_verify)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id, indicator_id) DO UPDATE SET can_write = EXCLUDED.can_write, can_verify = EXCLUDED.can_verify
       RETURNING id`,
      [userId, indRows[0].id, canWrite, canVerify],
    );
    await logAudit(client, caller.uid, 'ASSIGN', 'indicator_assignment', rows[0].id, { userId, indicatorCode, canWrite, canVerify });
    return rows[0].id;
  });
  if (!result) return res.status(404).json({ error: 'Indikator tidak ditemukan.' });
  res.status(201).json({ id: result });
});

adminRouter.delete('/assignments/:id', async (req, res) => {
  const caller = callerOf(req);
  const result = await withCaller(caller, async (client) => {
    const { rowCount } = await client.query('DELETE FROM indicator_assignments WHERE id = $1', [req.params.id]);
    if (rowCount) await logAudit(client, caller.uid, 'UNASSIGN', 'indicator_assignment', req.params.id, {});
    return rowCount;
  });
  if (!result) return res.status(404).json({ error: 'Penugasan tidak ditemukan.' });
  res.json({ ok: true });
});
