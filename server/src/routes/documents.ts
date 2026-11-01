import { Router } from 'express';
import path from 'node:path';
import { z } from 'zod';
import { withCaller } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { logAudit } from '../audit.js';
import { env } from '../env.js';
import { createResumableSession, getFileMetadata, getShortLivedDownload, getFileBuffer, deleteFromDrive } from '../googleDrive.js';

export const documentsRouter = Router();
documentsRouter.use(requireAuth);

function callerOf(req: import('express').Request) {
  return { uid: req.user!.sub, role: req.user!.role };
}

const ALLOWED_EXT = new Set(['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.png', '.jpg', '.jpeg']);

// Di atas ambang ini, download dibalas sebagai URL Drive berumur pendek (bukan di-proxy penuh) —
// supaya tidak melampaui limit payload response Netlify Function (~6MB).
const PROXY_SIZE_THRESHOLD = 4 * 1024 * 1024;

const CATEGORIES = ['Sambutan', 'Materi Narasumber', 'Dokumen Pendukung', 'Referensi'] as const;

// GET /api/documents — daftar + filter
documentsRouter.get('/', async (req, res) => {
  const caller = callerOf(req);
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  const indicatorCode = typeof req.query.indicator === 'string' ? req.query.indicator : undefined;
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;

  const rows = await withCaller(caller, async (client) => {
    const conditions: string[] = [`d.status = 'ACTIVE'`];
    const params: unknown[] = [];
    if (category && category !== 'Semua') { params.push(category); conditions.push(`d.category = $${params.length}`); }
    if (q) { params.push(`%${q}%`); conditions.push(`d.title ILIKE $${params.length}`); }
    if (indicatorCode) {
      params.push(indicatorCode);
      conditions.push(`EXISTS (
        SELECT 1 FROM document_links dl JOIN indicators i ON i.id = dl.indicator_id
        WHERE dl.document_id = d.id AND i.code = $${params.length}
      )`);
    }
    const { rows } = await client.query(
      `SELECT d.id, d.title, d.category, d.mime_type, d.size_bytes, d.classification, d.status, d.created_at,
              p.full_name AS owner_name,
              (SELECT array_agg(i.short_name) FROM document_links dl JOIN indicators i ON i.id = dl.indicator_id WHERE dl.document_id = d.id) AS indicators
       FROM documents d
       LEFT JOIN profiles p ON p.id = d.owner_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY d.created_at DESC`,
      params,
    );
    return rows;
  });
  res.json({ documents: rows });
});

const uploadSessionSchema = z.object({
  title: z.string().min(2),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
});

// POST /api/documents/upload-session — buka sesi resumable upload Drive (STAF/SUPERADMIN).
// Byte file TIDAK lewat Function ini sama sekali; klien PUT langsung ke sessionUrl yang dikembalikan.
documentsRouter.post('/upload-session', requireRole('STAF', 'SUPERADMIN'), async (req, res) => {
  const parsed = uploadSessionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Metadata upload tidak valid.' });
  const { title, fileName, mimeType, sizeBytes } = parsed.data;

  const ext = path.extname(fileName).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) return res.status(400).json({ error: 'Tipe file tidak didukung.' });
  if (sizeBytes > env.maxUploadBytes) return res.status(400).json({ error: 'File wajib diunggah (maks 10 MiB).' });

  const sessionUrl = await createResumableSession({ name: `${title}${ext}`, mimeType });
  res.json({ sessionUrl });
});

const uploadCompleteSchema = z.object({
  driveFileId: z.string().min(1),
  title: z.string().min(2),
  category: z.enum(CATEGORIES),
  indicatorCode: z.string().optional(),
  classification: z.enum(['INTERNAL', 'RESTRICTED']).optional(),
});

// POST /api/documents/upload-complete — setelah klien selesai PUT byte ke Drive, catat metadatanya (STAF/SUPERADMIN).
documentsRouter.post('/upload-complete', requireRole('STAF', 'SUPERADMIN'), async (req, res) => {
  const caller = callerOf(req);
  const parsed = uploadCompleteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Metadata dokumen tidak valid.' });
  const { driveFileId, title, category, indicatorCode, classification } = parsed.data;

  const meta = await getFileMetadata(driveFileId);
  if (!meta.parents.includes(env.google.rootFolderId)) {
    return res.status(400).json({ error: 'File tidak berada di folder arsip yang diharapkan.' });
  }
  if (meta.size > env.maxUploadBytes) {
    await deleteFromDrive(driveFileId).catch(() => {});
    return res.status(400).json({ error: 'File wajib diunggah (maks 10 MiB).' });
  }

  const result = await withCaller(caller, async (client) => {
    const { rows } = await client.query(
      `INSERT INTO documents (title, category, mime_type, size_bytes, storage_key, checksum, classification, owner_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [title, category, meta.mimeType, meta.size, driveFileId, meta.md5Checksum, classification ?? 'INTERNAL', caller.uid],
    );
    const documentId = rows[0].id;

    if (indicatorCode) {
      const { rows: indRows } = await client.query('SELECT id FROM indicators WHERE code = $1', [indicatorCode]);
      if (indRows[0]) {
        await client.query(
          'INSERT INTO document_links (document_id, indicator_id) VALUES ($1,$2)',
          [documentId, indRows[0].id],
        );
      }
    }
    await logAudit(client, caller.uid, 'UPLOAD', 'document', documentId, { title, category });
    return documentId;
  });

  res.status(201).json({ id: result, title, category, sizeBytes: meta.size, mimeType: meta.mimeType });
});

// GET /api/documents/:id — metadata detail
documentsRouter.get('/:id', async (req, res) => {
  const caller = callerOf(req);
  const row = await withCaller(caller, async (client) => {
    const { rows } = await client.query(
      `SELECT d.id, d.title, d.category, d.mime_type, d.size_bytes, d.classification, d.status, d.created_at,
              p.full_name AS owner_name,
              (SELECT array_agg(i.short_name) FROM document_links dl JOIN indicators i ON i.id = dl.indicator_id WHERE dl.document_id = d.id) AS indicators
       FROM documents d LEFT JOIN profiles p ON p.id = d.owner_id WHERE d.id = $1`,
      [req.params.id],
    );
    return rows[0] ?? null;
  });
  if (!row) return res.status(404).json({ error: 'Dokumen tidak ditemukan atau akses ditolak.' });
  res.json(row);
});

// GET /api/documents/:id/download — RLS menentukan visibilitas baris.
// File kecil diproxy penuh (Content-Disposition presisi); file besar dibalas sebagai URL Drive
// berumur pendek supaya tidak melampaui limit payload response Netlify Function.
documentsRouter.get('/:id/download', async (req, res) => {
  const caller = callerOf(req);
  const row = await withCaller(caller, async (client) => {
    const { rows } = await client.query(
      'SELECT id, title, mime_type, size_bytes, storage_key FROM documents WHERE id = $1 AND status = $2',
      [req.params.id, 'ACTIVE'],
    );
    if (rows[0]) {
      await logAudit(client, caller.uid, 'DOWNLOAD', 'document', rows[0].id, {});
    }
    return rows[0] ?? null;
  });
  if (!row) return res.status(404).json({ error: 'Dokumen tidak ditemukan atau akses ditolak.' });

  try {
    if (row.size_bytes <= PROXY_SIZE_THRESHOLD) {
      const buffer = await getFileBuffer(row.storage_key);
      res.setHeader('Content-Type', row.mime_type);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(row.title)}"`);
      res.send(buffer);
    } else {
      const { url, accessToken } = await getShortLivedDownload(row.storage_key);
      res.json({ downloadUrl: url, accessToken });
    }
  } catch (err: any) {
    if (err?.code === 404) return res.status(410).json({ error: 'Berkas tidak ditemukan di Drive (orphan).' });
    throw err;
  }
});

// POST /api/documents/:id/archive — pemilik/admin mengarsipkan (soft delete, tercatat di audit)
documentsRouter.post('/:id/archive', requireRole('STAF', 'SUPERADMIN'), async (req, res) => {
  const caller = callerOf(req);
  const result = await withCaller(caller, async (client) => {
    const { rowCount } = await client.query(
      `UPDATE documents SET status = 'ARCHIVED' WHERE id = $1`,
      [req.params.id],
    );
    if (rowCount) await logAudit(client, caller.uid, 'ARCHIVE', 'document', req.params.id, {});
    return rowCount;
  });
  if (!result) return res.status(404).json({ error: 'Dokumen tidak ditemukan atau akses ditolak.' });
  res.json({ ok: true });
});
