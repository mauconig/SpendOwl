import { Hono } from 'hono';
import type { AppEnv } from '../auth.ts';
import { materializeDueCharges } from '../charges.ts';
import { getSummary } from '../summary.ts';

// The query and the pace math live in ../summary.ts so the chat coach's
// get_budget_summary tool answers from the same numbers this endpoint serves.
export const summaryRoute = new Hono<AppEnv>().get('/', async c => {
  // Subscriptions charge on read (see ../charges.ts) — this has to run before
  // the totals are computed or a renewal due today would be missing from them.
  await materializeDueCharges(c.get('userId'));
  const summary = await getSummary(c.get('userId'));
  if (!summary) return c.json({ error: 'User not provisioned' }, 404);
  return c.json(summary);
});
