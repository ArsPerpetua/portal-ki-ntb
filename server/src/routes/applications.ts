import { Router } from 'express';
import { withCaller } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

export const applicationsRouter = Router();
applicationsRouter.use(requireAuth);

applicationsRouter.get('/', async (req, res) => {
  const caller = { uid: req.user!.sub, role: req.user!.role };
  const rows = await withCaller(caller, async (client) => {
    const { rows } = await client.query(
      'SELECT id, name, description, url, icon, sort_order FROM applications WHERE is_active = true ORDER BY sort_order',
    );
    return rows;
  });
  res.json({ applications: rows });
});
