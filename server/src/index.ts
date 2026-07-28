import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { AppEnv } from './auth.ts';
import { requireAuth } from './auth.ts';
import { pool, waitForDatabase } from './db.ts';
import { env } from './env.ts';
import { runMigrations } from './migrations.ts';
import { cardsRoute } from './routes/cards.ts';
import { messagesRoute } from './routes/messages.ts';
import { receiptsRoute } from './routes/receipts.ts';
import { settingsRoute } from './routes/settings.ts';
import { subscriptionsRoute } from './routes/subscriptions.ts';
import { summaryRoute } from './routes/summary.ts';
import { transactionsRoute } from './routes/transactions.ts';

const app = new Hono<AppEnv>();

app.use('*', logger());

// The app is a native client, not a browser, so there is no cookie-bearing
// origin to protect. CORS is open here only so Expo *web* can also hit the API
// during development; auth is carried by the bearer token, not the origin.
app.use('*', cors({ origin: '*', allowHeaders: ['Authorization', 'Content-Type'] }));

// Unauthenticated: lets you confirm the phone can actually reach the machine
// before debugging tokens.
app.get('/api/health', c => c.json({ ok: true, service: 'spendowl-api' }));

app.use('/api/*', requireAuth);

app.route('/api/transactions', transactionsRoute);
app.route('/api/summary', summaryRoute);
app.route('/api/credit-cards', cardsRoute);
app.route('/api/subscriptions', subscriptionsRoute);
app.route('/api/receipts', receiptsRoute);
app.route('/api/messages', messagesRoute);
app.route('/api/settings', settingsRoute);

app.onError((error, c) => {
  console.error('[error]', error);
  return c.json({ error: 'Internal server error' }, 500);
});

app.notFound(c => c.json({ error: 'Not found' }, 404));

await waitForDatabase();
await runMigrations();

// host 0.0.0.0, not localhost: Expo Go runs on the phone, so the API has to be
// reachable on the machine's LAN address, not just the loopback interface.
const server = serve({ fetch: app.fetch, port: env.port, hostname: '0.0.0.0' }, info => {
  console.log(`[spendowl-api] listening on http://0.0.0.0:${info.port}`);
});

async function shutdown() {
  server.close();
  await pool.end();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
