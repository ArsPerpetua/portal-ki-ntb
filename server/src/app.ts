import express from 'express';
import cors from 'cors';
import { env } from './env.js';
import { authRouter } from './routes/auth.js';
import { indicatorsRouter } from './routes/indicators.js';
import { recordsRouter } from './routes/records.js';
import { documentsRouter } from './routes/documents.js';
import { applicationsRouter } from './routes/applications.js';
import { auditLogsRouter } from './routes/auditLogs.js';
import { activityRouter } from './routes/activity.js';
import { adminRouter } from './routes/admin.js';

const app = express();
app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/indicators', indicatorsRouter);
app.use('/api/records', recordsRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/applications', applicationsRouter);
app.use('/api/audit-logs', auditLogsRouter);
app.use('/api/activity', activityRouter);
app.use('/api/admin', adminRouter);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
});

export default app;
