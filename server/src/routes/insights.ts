import { Hono } from 'hono';
import type { AppEnv } from '../auth.ts';
import { getUserCurrency } from '../currency.ts';
import { env } from '../env.ts';
import { generateInsights, readInsights } from '../insights.ts';

/**
 * The Home screen's "For you today" cards. See ../insights.ts for what they are
 * and why they are cached rather than generated per request.
 *
 * Split deliberately across two endpoints. `GET` is a plain cache read, so Home
 * renders the instant it mounts and never waits on a model. `POST /refresh` is
 * the only thing that can spend money, and it is self-limiting: it regenerates
 * only when today's set is missing, so there is no force flag and no need for a
 * rate limiter to cap it at one call per user per day.
 */
export const insightsRoute = new Hono<AppEnv>()

  .get('/', async c => {
    const userId = c.get('userId');
    return c.json(await readInsights(userId, await getUserCurrency(userId)));
  })

  .post('/refresh', async c => {
    if (!env.llmApiKey) {
      return c.json({ error: 'Insights are not configured on this server (LLM_API_KEY is unset).' }, 503);
    }

    const userId = c.get('userId');
    const currency = await getUserCurrency(userId);

    const cached = await readInsights(userId, currency);
    if (!cached.stale) return c.json(cached);

    try {
      return c.json(await generateInsights(userId, currency));
    } catch (error) {
      // Never fatal. The client treats any refresh failure as "keep showing the
      // rule-based cards", so a bad turn costs the user nothing visible.
      console.error('[insights]', error);
      return c.json({ error: "Couldn't refresh your insights right now." }, 502);
    }
  });
