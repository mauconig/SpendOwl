import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../auth.ts';
import { query, queryOne } from '../db.ts';

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  // Optional: the app no longer asks for it. Still validated when a client does
  // send it, so the column never holds something that isn't four digits.
  last4: z.string().regex(/^\d{4}$/, 'last4 must be exactly 4 digits').optional(),
  balanceMinor: z.int().nonnegative(),
  limitMinor: z.int().nonnegative(),
  apr: z.number().min(0).max(100),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});

const payoffSchema = z.object({ amountMinor: z.int().positive() });

const SELECT = `
  SELECT id,
         name,
         last4,
         balance_minor      AS "balanceMinor",
         credit_limit_minor AS "limitMinor",
         apr,
         color
  FROM credit_cards
`;

export const cardsRoute = new Hono<AppEnv>()

  .get('/', async c => {
    const rows = await query(`${SELECT} WHERE user_id = $1 ORDER BY created_at`, [c.get('userId')]);
    return c.json(rows);
  })

  .post('/', async c => {
    const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid body', issues: parsed.error.issues }, 400);
    const body = parsed.data;

    const row = await queryOne(
      `INSERT INTO credit_cards (user_id, name, last4, balance_minor, credit_limit_minor, apr, color)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, last4, balance_minor AS "balanceMinor",
                 credit_limit_minor AS "limitMinor", apr, color`,
      [c.get('userId'), body.name, body.last4 ?? null, body.balanceMinor, body.limitMinor, body.apr, body.color]
    );
    return c.json(row, 201);
  })

  // Paying a card down is a balance decrement, floored at zero so an
  // overpayment can never drive the balance negative.
  .post('/:id/payoff', async c => {
    const parsed = payoffSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid body', issues: parsed.error.issues }, 400);

    const row = await queryOne(
      `UPDATE credit_cards
          SET balance_minor = GREATEST(balance_minor - $3, 0)
        WHERE id = $1 AND user_id = $2
        RETURNING id, name, last4, balance_minor AS "balanceMinor",
                  credit_limit_minor AS "limitMinor", apr, color`,
      [c.req.param('id'), c.get('userId'), parsed.data.amountMinor]
    );
    if (!row) return c.json({ error: 'Not found' }, 404);
    return c.json(row);
  })

  // The mirror of payoff: buying something on a card increases what you owe.
  // Deliberately not capped at the credit limit — going over one is a real
  // thing that happens, and silently clamping would make the balance disagree
  // with the statement, which is worse than showing an uncomfortable number.
  .post('/:id/charge', async c => {
    const parsed = payoffSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid body', issues: parsed.error.issues }, 400);

    const row = await queryOne(
      `UPDATE credit_cards
          SET balance_minor = balance_minor + $3
        WHERE id = $1 AND user_id = $2
        RETURNING id, name, last4, balance_minor AS "balanceMinor",
                  credit_limit_minor AS "limitMinor", apr, color`,
      [c.req.param('id'), c.get('userId'), parsed.data.amountMinor]
    );
    if (!row) return c.json({ error: 'Not found' }, 404);
    return c.json(row);
  })

  .delete('/:id', async c => {
    const row = await queryOne('DELETE FROM credit_cards WHERE id = $1 AND user_id = $2 RETURNING id', [
      c.req.param('id'),
      c.get('userId'),
    ]);
    if (!row) return c.json({ error: 'Not found' }, 404);
    return c.body(null, 204);
  });
