import { Router } from 'express';
import { z } from 'zod';
import { adminPool } from '../db.js';
import { comparePassword, signToken } from '../auth.js';
import { logAudit } from '../audit.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Email dan password wajib diisi.' });
  }
  const { email, password } = parsed.data;

  // Pencarian akun dilakukan via admin pool (seperti auth service terpisah dari RLS data aplikasi),
  // karena pada tahap ini belum ada identitas RLS yang bisa diset.
  const { rows } = await adminPool.query(
    'SELECT id, email, password_hash, full_name, role, is_active FROM profiles WHERE email = $1',
    [email.toLowerCase()],
  );
  const profile = rows[0];
  if (!profile || !profile.is_active) {
    return res.status(401).json({ error: 'Email atau password salah.' });
  }
  const valid = await comparePassword(password, profile.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Email atau password salah.' });
  }

  const token = signToken({ sub: profile.id, role: profile.role, email: profile.email, fullName: profile.full_name });
  const client = await adminPool.connect();
  try {
    await logAudit(client, profile.id, 'LOGIN', 'profile', profile.id, {});
  } finally {
    client.release();
  }

  res.json({
    token,
    user: { id: profile.id, email: profile.email, fullName: profile.full_name, role: profile.role },
  });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: { id: req.user!.sub, email: req.user!.email, fullName: req.user!.fullName, role: req.user!.role } });
});
