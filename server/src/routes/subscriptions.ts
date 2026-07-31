import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../auth.ts';
import { materializeDueCharges } from '../charges.ts';
import { CURRENCIES, getUserCurrency } from '../currency.ts';
import { queryOne } from '../db.ts';
import { listSubscriptions } from '../subscriptions.ts';

const RETURNING = `
  RETURNING id, name, color, price_minor AS "priceMinor", currency,
            day_of_month AS "dayOfMonth", muted, cancelled AS off,
            card_id AS "cardId"
`;

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  priceMinor: z.int().nonnegative(),
  dayOfMonth: z.int().min(1).max(31),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  currency: z.enum(CURRENCIES).optional(),
  cardId: z.uuid().nullish(),
});

// muted/off were the only editable fields; price, currency, renewal day and
// card are now editable too, since a subscription's price in USD is a fact
// about the world that changes and there was previously no way to correct it
// short of cancelling and re-adding through the chat coach.
const updateSchema = z.object({
  muted: z.boolean().optional(),
  off: z.boolean().optional(),
  name: z.string().trim().min(1).max(80).optional(),
  priceMinor: z.int().nonnegative().optional(),
  dayOfMonth: z.int().min(1).max(31).optional(),
  currency: z.enum(CURRENCIES).optional(),
  cardId: z.uuid().nullish(),
});

// Mirrors CARD_COLORS in src/store/constants.ts. Assigned round-robin so a new
// subscription doesn't arrive colourless, and the caller never has to pick.
const COLORS = ['#F0A878', '#78ADEE', '#C9B8F5', '#4ADE80'];

/** Same guard as routes/transactions.ts: never trust a caller's card id. */
async function ownsCard(userId: string, cardId: string): Promise<boolean> {
  const row = await queryOne('SELECT id FROM credit_cards WHERE id = $1 AND user_id = $2', [cardId, userId]);
  return row !== null;
}

export const subscriptionsRoute = new Hono<AppEnv>()

  .get('/', async c => {
    const userId = c.get('userId');
    // A renewal that came due is a transaction now, so charge before listing —
    // the sheet and the transaction list should never disagree about it.
    await materializeDueCharges(userId);
    return c.json(await listSubscriptions(userId, await getUserCurrency(userId)));
  })

  .post('/', async c => {
    const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid body', issues: parsed.error.issues }, 400);
    const body = parsed.data;
    const userId = c.get('userId');

    if (body.cardId && !(await ownsCard(userId, body.cardId))) {
      return c.json({ error: 'Unknown card' }, 400);
    }

    const existing = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM subscriptions WHERE user_id = $1`,
      [userId]
    );

    const row = await queryOne(
      `INSERT INTO subscriptions (user_id, name, color, price_minor, day_of_month, currency, card_id)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, $7), $8)
       ${RETURNING}`,
      [
        userId,
        body.name,
        body.color ?? COLORS[(existing?.count ?? 0) % COLORS.length],
        body.priceMinor,
        body.dayOfMonth,
        body.currency ?? null,
        // No currency given means it was typed in whatever the user reads the
        // app in, which is exactly what the column meant before it existed.
        await getUserCurrency(userId),
        body.cardId ?? null,
      ]
    );
    return c.json(row, 201);
  })

  .patch('/:id', async c => {
    const parsed = updateSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid body', issues: parsed.error.issues }, 400);
    const body = parsed.data;
    const userId = c.get('userId');

    if (body.cardId && !(await ownsCard(userId, body.cardId))) {
      return c.json({ error: 'Unknown card' }, 400);
    }

    // COALESCE keeps every omitted field at its current value. card_id is the
    // exception: an explicit null means "unlink this card", which COALESCE
    // cannot express — hence the separate $9 flag.
    const row = await queryOne(
      `UPDATE subscriptions
          SET muted        = COALESCE($3, muted),
              cancelled    = COALESCE($4, cancelled),
              name         = COALESCE($5, name),
              price_minor  = COALESCE($6, price_minor),
              day_of_month = COALESCE($7, day_of_month),
              currency     = COALESCE($8, currency),
              card_id      = CASE WHEN $9 THEN $10 ELSE card_id END
        WHERE id = $1 AND user_id = $2
        ${RETURNING}`,
      [
        c.req.param('id'),
        userId,
        body.muted ?? null,
        body.off ?? null,
        body.name ?? null,
        body.priceMinor ?? null,
        body.dayOfMonth ?? null,
        body.currency ?? null,
        body.cardId !== undefined,
        body.cardId ?? null,
      ]
    );
    if (!row) return c.json({ error: 'Not found' }, 404);
    return c.json(row);
  });
