import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../auth.ts';
import { query, queryOne } from '../db.ts';

// The column is `cancelled`, but the client's store has always called this
// `off` — aliased here so useSpendOwl()'s surface doesn't change.
const SELECT = `
  SELECT id,
         name,
         color,
         price_minor  AS "priceMinor",
         day_of_month AS "dayOfMonth",
         muted,
         cancelled    AS off
  FROM subscriptions
`;

const updateSchema = z.object({
  muted: z.boolean().optional(),
  off: z.boolean().optional(),
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  priceMinor: z.int().nonnegative(),
  dayOfMonth: z.int().min(1).max(31),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

// Mirrors CARD_COLORS in src/store/constants.ts. Assigned round-robin so a new
// subscription doesn't arrive colourless, and the caller never has to pick.
const COLORS = ['#F0A878', '#78ADEE', '#C9B8F5', '#4ADE80'];

export const subscriptionsRoute = new Hono<AppEnv>()

  .get('/', async c => {
    const rows = await query(`${SELECT} WHERE user_id = $1 ORDER BY day_of_month`, [c.get('userId')]);
    return c.json(rows);
  })

  .post('/', async c => {
    const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid body', issues: parsed.error.issues }, 400);
    const body = parsed.data;

    const existing = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM subscriptions WHERE user_id = $1`,
      [c.get('userId')]
    );

    const row = await queryOne(
      `INSERT INTO subscriptions (user_id, name, color, price_minor, day_of_month)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, color, price_minor AS "priceMinor",
                 day_of_month AS "dayOfMonth", muted, cancelled AS off`,
      [
        c.get('userId'),
        body.name,
        body.color ?? COLORS[(existing?.count ?? 0) % COLORS.length],
        body.priceMinor,
        body.dayOfMonth,
      ]
    );
    return c.json(row, 201);
  })

  .patch('/:id', async c => {
    const parsed = updateSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid body', issues: parsed.error.issues }, 400);
    const body = parsed.data;

    const row = await queryOne(
      `UPDATE subscriptions
          SET muted     = COALESCE($3, muted),
              cancelled = COALESCE($4, cancelled)
        WHERE id = $1 AND user_id = $2
        RETURNING id, name, color, price_minor AS "priceMinor",
                  day_of_month AS "dayOfMonth", muted, cancelled AS off`,
      [c.req.param('id'), c.get('userId'), body.muted ?? null, body.off ?? null]
    );
    if (!row) return c.json({ error: 'Not found' }, 404);
    return c.json(row);
  });
