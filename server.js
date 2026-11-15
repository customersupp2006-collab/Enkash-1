import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import Database from 'better-sqlite3';
import QRCode from 'qrcode';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { verifyWebhook, fetchStatus } from './provider.js';

const app = express();
const demo = process.env.PAYMENT_MODE === 'demo';
const port = Number(process.env.PORT || 3000);
if (!demo && process.env.PAYMENT_MODE !== 'live') {
  throw new Error('Set PAYMENT_MODE=demo or live');
}
if (!demo && (!process.env.ENKASH_API_KEY || !process.env.ENKASH_SECRET_KEY)) {
  throw new Error('Missing EnKash credentials');
}
const dbPath = path.resolve(process.env.DATABASE_PATH || './data/payments.sqlite');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.exec(`CREATE TABLE IF NOT EXISTS payments (
  reference TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL UNIQUE,
  amount_paise INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PENDING','PAID','FAILED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
const insert = db.prepare('INSERT INTO payments(reference,provider_id,amount_paise,currency,status) VALUES (?,?,?,?,?)');
const find = db.prepare('SELECT * FROM payments WHERE reference = ?');
const markPaid = db.prepare("UPDATE payments SET status='PAID',updated_at=CURRENT_TIMESTAMP WHERE reference=? AND status='PENDING'");
const markFailed = db.prepare("UPDATE payments SET status='FAILED',updated_at=CURRENT_TIMESTAMP WHERE reference=? AND status='PENDING'");
app.disable('x-powered-by');
app.use(helmet());
app.use('/api', rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false }));

function matchesVerified(record, status) {
  return status?.reference === record.reference &&
    status?.providerId === record.provider_id &&
    status?.amountPaise === record.amount_paise &&
    status?.currency === record.currency;
}
async function reconcile(record) {
  if (demo || record.status !== 'PENDING') return record;
  const status = await fetchStatus(record.provider_id);
  if (!matchesVerified(record, status)) throw new Error('Provider status does not match payment record');
  if (status.status === 'SUCCESS') markPaid.run(record.reference);
  else if (status.status === 'FAILED') markFailed.run(record.reference);
  return find.get(record.reference);
}

// Webhook uses raw bytes, never accepts unsigned success claims.
app.post('/webhooks/enkash', express.raw({ type: '*/*', limit: '128kb' }), async (req, res) => {
  if (demo) return res.status(503).json({ error: 'Webhooks disabled in demo mode' });
  try {
    const event = await verifyWebhook(req.body, req.headers);
    const record = find.get(event.reference);
    if (!record || record.provider_id !== event.providerId) return res.sendStatus(404);
    await reconcile(record);
    return res.sendStatus(200);
  } catch (err) {
    console.error('Webhook rejected:', err.message);
    return res.sendStatus(400);
  }
});

app.use(express.json({ limit: '16kb' }));
app.get('/health', (_req, res) => res.json({ ok: true, mode: demo ? 'demo' : 'live' }));
const createSchema = z.object({
  amount: z.number().finite().min(1).max(100000).refine(
    v => Math.abs(v * 100 - Math.round(v * 100)) < 1e-7,
    'Max two decimal places'
  )
}).strict();

app.post('/api/payments', async (req, res) => {
  try {
    // Live mode must verify an authenticated Shopify payment session and amount.
    if (!demo) return res.status(501).json({ error: 'Live payment creation requires approved Shopify integration and verified session' });
    const configuredToken = process.env.DEMO_API_TOKEN;
    const receivedToken = req.get('x-demo-token');
    if (!configuredToken || !receivedToken ||
      Buffer.byteLength(configuredToken) !== Buffer.byteLength(receivedToken) ||
      !crypto.timingSafeEqual(Buffer.from(configuredToken), Buffer.from(receivedToken))) {
      return res.status(401).json({ error: 'Invalid demo token' });
    }
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid amount', details: parsed.error.flatten() });
    const reference = crypto.randomUUID();
    const amountPaise = Math.round(parsed.data.amount * 100);
    const providerId = `demo-${reference}`;
    insert.run(reference, providerId, amountPaise, 'INR', 'PENDING');
    // No real QR/intent is produced in demo mode.
    const qrPayload = null;
    const qrDataUrl = qrPayload ? await QRCode.toDataURL(qrPayload) : null;
    return res.status(201).json({ reference, status: 'PENDING', amountPaise, currency: 'INR', intentUrls: {}, qrDataUrl, demo: true });
  } catch (err) {
    console.error('Create payment error:', err.message);
    return res.status(500).json({ error: 'Unable to create payment' });
  }
});
app.get('/api/payments/:reference', async (req, res) => {
  if (!/^[a-f0-9-]{36}$/.test(req.params.reference)) return res.status(400).json({ error: 'Invalid reference' });
  // Add customer/order ownership authorization before production use.
  const record = find.get(req.params.reference);
  if (!record) return res.status(404).json({ error: 'Payment not found' });
  try {
    const latest = await reconcile(record);
    return res.json({ reference: latest.reference, status: latest.status, currency: latest.currency, demo });
  } catch (err) {
    console.error('Status check error:', err.message);
    return res.status(502).json({ error: 'Provider verification unavailable' });
  }
});
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.listen(port, '0.0.0.0', () => console.log(`EnKash backend listening on port ${port} (${demo ? 'DEMO' : 'LIVE — adapter not configured'})`));
