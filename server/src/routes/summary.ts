import { Hono } from 'hono';
import type { AppEnv } from '../auth.ts';
import { getSummary } from '../summary.ts';

// The query and the pace math live in ../summary.ts so the chat coach's
// get_budget_summary tool answers from the same numbers this endpoint serves.
export const summaryRoute = new Hono<AppEnv>().get('/', async c => {
  const summary = await getSummary(c.get('userId'));
  if (!summary) return c.json({ error: 'User not provisioned' }, 404);
  return c.json(summary);
});
