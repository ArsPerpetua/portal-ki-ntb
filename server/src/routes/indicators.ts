import { Router } from 'express';
import { z } from 'zod';
import { withCaller } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { logAudit } from '../audit.js';

export const indicatorsRouter = Router();
indicatorsRouter.use(requireAuth);

function callerOf(req: import('express').Request) {
  return { uid: req.user!.sub, role: req.user!.role };
}

// GET /api/indicators — ringkasan 7 indikator untuk dashboard & direktori
indicatorsRouter.get('/', async (req, res) => {
  const caller = callerOf(req);
  const data = await withCaller(caller, async (client) => {
    const { rows: indicators } = await client.query(
      'SELECT id, code, name, short_name, unit, counting_definition, sort_order, manual_value FROM indicators ORDER BY sort_order',
    );
    const { rows: counts } = await client.query(`
      SELECT indicator_id, status, count(*)::int AS n
      FROM ki_records GROUP BY indicator_id, status
    `);
    const { rows: monthly } = await client.query(`
      SELECT indicator_id, to_char(date_trunc('month', verified_at), 'YYYY-MM') AS month, count(*)::int AS n
      FROM ki_records
      WHERE status = 'VERIFIED' AND verified_at IS NOT NULL
      GROUP BY indicator_id, month
      ORDER BY month
    `);
    const { rows: docCounts } = await client.query(`
      SELECT dl.indicator_id, count(DISTINCT dl.document_id)::int AS n
      FROM document_links dl
      WHERE dl.indicator_id IS NOT NULL
      GROUP BY dl.indicator_id
    `);
    return { indicators, counts, monthly, docCounts };
  });

  const byIndicator = new Map<string, Record<string, number>>();
  for (const c of data.counts) {
    const m = byIndicator.get(c.indicator_id) ?? {};
    m[c.status] = c.n;
    byIndicator.set(c.indicator_id, m);
  }
  const monthlyByIndicator = new Map<string, Map<string, number>>();
  for (const m of data.monthly) {
    const map = monthlyByIndicator.get(m.indicator_id) ?? new Map();
    map.set(m.month, m.n);
    monthlyByIndicator.set(m.indicator_id, map);
  }
  const docByIndicator = new Map<string, number>(data.docCounts.map((d: any) => [d.indicator_id, d.n]));

  const result = data.indicators.map((ind: any) => {
    const counts = byIndicator.get(ind.id) ?? {};
    const verified = counts.VERIFIED ?? 0;
    const pendingReview = counts.PENDING_REVIEW ?? 0;
    const isManual = ind.manual_value != null;
    const value = isManual ? ind.manual_value : verified;
    const monthMap = monthlyByIndicator.get(ind.id) ?? new Map();
    const trend: number[] = [];
    let running = 0;
    const sortedMonths = [...monthMap.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const cumulativeByMonth = new Map<string, number>();
    for (const [month, n] of sortedMonths) {
      running += n;
      cumulativeByMonth.set(month, running);
    }
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      let value = 0;
      for (const [m, cum] of cumulativeByMonth) if (m <= key) value = cum;
      trend.push(value);
    }
    const allZero: boolean = trend.every((v) => v === 0);
    if (allZero && value > 0) {
      trend[trend.length - 1] = value;
    }
    const delta = trend.length >= 2 ? trend[trend.length - 1] - trend[trend.length - 2] : 0;

    return {
      id: ind.code,
      label: ind.name,
      short: ind.short_name,
      unit: ind.unit,
      countingDefinition: ind.counting_definition,
      value,
      isManual,
      pendingReview,
      documentCount: docByIndicator.get(ind.id) ?? 0,
      delta,
      trend,
    };
  });

  res.json({ indicators: result });
});

// GET /api/indicators/:code — detail + daftar entitas (dengan filter)
indicatorsRouter.get('/:code', async (req, res) => {
  const caller = callerOf(req);
  const { code } = req.params;
  const district = typeof req.query.district === 'string' ? req.query.district : undefined;
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;

  const data = await withCaller(caller, async (client) => {
    const { rows: indRows } = await client.query(
      'SELECT id, code, name, short_name, unit, counting_definition, mode, manual_value FROM indicators WHERE code = $1',
      [code],
    );
    const indicator = indRows[0];
    if (!indicator) return null;

    const { rows: contentRows } = await client.query(
      'SELECT body_md, updated_at FROM content_pages WHERE indicator_id = $1',
      [indicator.id],
    );

    const conditions = ['indicator_id = $1'];
    const params: unknown[] = [indicator.id];
    if (district) { params.push(district); conditions.push(`district = $${params.length}`); }
    if (status) { params.push(status); conditions.push(`status = $${params.length}`); }
    const { rows: records } = await client.query(
      `SELECT id, name, district, year, reference_no, status, attributes, description, created_at, verified_at
       FROM ki_records WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
      params,
    );

    const { rows: assignment } = await client.query(
      'SELECT can_write, can_verify FROM indicator_assignments WHERE indicator_id = $1 AND user_id = $2',
      [indicator.id, caller.uid],
    );

    return { indicator, content: contentRows[0] ?? null, records, assignment: assignment[0] ?? null };
  });

  if (!data) return res.status(404).json({ error: 'Indikator tidak ditemukan.' });
  res.json(data);
});

const createRecordSchema = z.object({
  name: z.string().min(2),
  district: z.string().min(2),
  year: z.number().int().min(1990).max(2100),
  referenceNo: z.string().optional(),
  description: z.string().max(2000).optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  submit: z.boolean().optional(),
});

// POST /api/indicators/:code/records — staf (assigned, can_write) atau superadmin membuat entitas baru
indicatorsRouter.post('/:code/records', async (req, res) => {
  const caller = callerOf(req);
  const { code } = req.params;
  const parsed = createRecordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Data tidak valid.', details: parsed.error.flatten() });
  const { name, district, year, referenceNo, description, attributes, submit } = parsed.data;

  try {
    const result = await withCaller(caller, async (client) => {
      const { rows: indRows } = await client.query('SELECT id FROM indicators WHERE code = $1', [code]);
      const indicator = indRows[0];
      if (!indicator) return { notFound: true } as const;

      const status = submit === false ? 'DRAFT' : 'PENDING_REVIEW';
      const { rows } = await client.query(
        `INSERT INTO ki_records (indicator_id, name, district, year, reference_no, description, status, attributes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, name, district, year, status, created_at`,
        [indicator.id, name, district, year, referenceNo ?? null, description ?? null, status, JSON.stringify(attributes ?? {}), caller.uid],
      );
      await logAudit(client, caller.uid, 'CREATE', 'ki_record', rows[0].id, { indicator: code, status });
      return { record: rows[0] } as const;
    });
    if ('notFound' in result) return res.status(404).json({ error: 'Indikator tidak ditemukan.' });
    res.status(201).json(result.record);
  } catch (err: any) {
    if (err?.code === '42501' || /row-level security/i.test(err?.message ?? '')) {
      return res.status(403).json({ error: 'Anda tidak memiliki hak tulis pada indikator ini.' });
    }
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'Nomor referensi sudah terdaftar pada indikator ini.' });
    }
    throw err;
  }
});

