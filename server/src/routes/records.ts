import { Router } from 'express';
import { z } from 'zod';
import { withCaller } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { logAudit } from '../audit.js';

export const recordsRouter = Router();
recordsRouter.use(requireAuth);

function callerOf(req: import('express').Request) {
  return { uid: req.user!.sub, role: req.user!.role };
}

// GET /api/records/:id — detail entitas: jejak proses + dokumen bukti tertaut
recordsRouter.get('/:id', async (req, res) => {
  const caller = callerOf(req);
  const result = await withCaller(caller, async (client) => {
    const { rows } = await client.query(
      `SELECT r.id, r.name, r.district, r.year, r.reference_no, r.status, r.attributes, r.description, r.rejection_reason,
              r.created_at, r.verified_at, r.indicator_id,
              i.code AS indicator_code, i.short_name AS indicator_short_name,
              creator.full_name AS created_by_name, verifier.full_name AS verified_by_name
       FROM ki_records r
       JOIN indicators i ON i.id = r.indicator_id
       LEFT JOIN profiles creator ON creator.id = r.created_by
       LEFT JOIN profiles verifier ON verifier.id = r.verified_by
       WHERE r.id = $1`,
      [req.params.id],
    );
    const record = rows[0];
    if (!record) return null;

    const { rows: documents } = await client.query(
      `SELECT d.id, d.title, d.category, d.mime_type, d.size_bytes
       FROM document_links dl JOIN documents d ON d.id = dl.document_id
       WHERE dl.ki_record_id = $1 AND d.status = 'ACTIVE'
       ORDER BY d.created_at DESC`,
      [req.params.id],
    );

    let canVerify = caller.role === 'SUPERADMIN';
    if (!canVerify) {
      const { rows: assignRows } = await client.query(
        'SELECT can_verify FROM indicator_assignments WHERE indicator_id = $1 AND user_id = $2',
        [record.indicator_id, caller.uid],
      );
      canVerify = !!assignRows[0]?.can_verify;
    }
    return { record, documents, canVerify };
  });
  if (!result) return res.status(404).json({ error: 'Entitas tidak ditemukan atau akses ditolak.' });
  res.json(result);
});

const verifySchema = z.object({
  decision: z.enum(['VERIFIED', 'REJECTED']),
  reason: z.string().optional(),
});

// POST /api/records/:id/verify — verifikator (can_verify) atau superadmin memutuskan status
recordsRouter.post('/:id/verify', async (req, res) => {
  const caller = callerOf(req);
  const { id } = req.params;
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Keputusan verifikasi tidak valid.' });
  const { decision, reason } = parsed.data;

  const result = await withCaller(caller, async (client) => {
    const { rows } = await client.query('SELECT id, indicator_id, status FROM ki_records WHERE id = $1', [id]);
    const record = rows[0];
    if (!record) return { status: 404 as const };
    if (record.status !== 'PENDING_REVIEW') {
      return { status: 409 as const, error: 'Hanya record berstatus menunggu review yang dapat diverifikasi.' };
    }

    if (caller.role !== 'SUPERADMIN') {
      const { rows: assignRows } = await client.query(
        'SELECT can_verify FROM indicator_assignments WHERE indicator_id = $1 AND user_id = $2',
        [record.indicator_id, caller.uid],
      );
      if (!assignRows[0]?.can_verify) {
        return { status: 403 as const, error: 'Anda tidak memiliki hak verifikasi pada indikator ini.' };
      }
    }

    await client.query(
      `UPDATE ki_records SET status = $1, verified_by = $2, verified_at = $3, rejection_reason = $4 WHERE id = $5`,
      [decision, caller.uid, decision === 'VERIFIED' ? new Date() : null, decision === 'REJECTED' ? (reason ?? null) : null, id],
    );
    await logAudit(client, caller.uid, decision === 'VERIFIED' ? 'VERIFY' : 'REJECT', 'ki_record', id, { reason });
    return { status: 200 as const };
  });

  if (result.status !== 200) return res.status(result.status).json({ error: (result as any).error ?? 'Gagal.' });
  res.json({ ok: true });
});
