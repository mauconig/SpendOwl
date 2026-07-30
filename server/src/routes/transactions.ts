import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../auth.ts';
import { query, queryOne } from '../db.ts';

// Exported so the chat coach's propose_expense tool offers exactly these — a
// proposal carrying a category this endpoint would reject turns into a card the
// user can tap "Approve & log" on and get a 400.
export const CATEGORIES = ['food', 'bills', 'shopping', 'transport', 'income', 'debt'] as const;

const createSchema = z.object({
  merchant: z.string().trim().min(1).max(120),
  category: z.enum(CATEGORIES),
  // Signed cents. Integer-only: a float here is the bug this whole
  // minor-units convention exists to prevent.
  amountMinor: z.int(),
  occurredAt: z.iso.date().optional(),
  note: z.string().trim().max(280).nullish(),
  taxDeductible: z.boolean().optional(),
});

const updateSchema = createSchema.partial();

const SELECT = `
  SELECT id,
         merchant,
         category,
         amount_minor    AS "amountMinor",
         occurred_at     AS "occurredAt",
         note,
         tax_deductible  AS "taxDeductible"
  FROM transactions
`;

export const transactionsRoute = new Hono<AppEnv>()

  .get('/', async c => {
    const rows = await query(`${SELECT} WHERE user_id = $1 ORDER BY occurred_at DESC, created_at DESC`, [
      c.get('userId'),
    ]);
    return c.json(rows);
  })

  .post('/', async c => {
    const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid body', issues: parsed.error.issues }, 400);
    const body = parsed.data;

    const row = await queryOne(
      `INSERT INTO transactions (user_id, merchant, category, amount_minor, occurred_at, note, tax_deductible)
       VALUES ($1, $2, $3, $4, COALESCE($5::date, CURRENT_DATE), $6, COALESCE($7, FALSE))
       RETURNING id, merchant, category, amount_minor AS "amountMinor", occurred_at AS "occurredAt",
                 note, tax_deductible AS "taxDeductible"`,
      [
        c.get('userId'),
        body.merchant,
        body.category,
        body.amountMinor,
        body.occurredAt ?? null,
        body.note ?? null,
        body.taxDeductible ?? null,
      ]
    );
    return c.json(row, 201);
  })

  .patch('/:id', async c => {
    const parsed = updateSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid body', issues: parsed.error.issues }, 400);
    const body = parsed.data;

    // COALESCE keeps every omitted field at its current value, so a partial
    // patch never blanks a column.
    const row = await queryOne(
      `UPDATE transactions
          SET merchant       = COALESCE($3, merchant),
              category       = COALESCE($4, category),
              amount_minor   = COALESCE($5, amount_minor),
              occurred_at    = COALESCE($6::date, occurred_at),
              note           = COALESCE($7, note),
              tax_deductible = COALESCE($8, tax_deductible)
        WHERE id = $1 AND user_id = $2
        RETURNING id, merchant, category, amount_minor AS "amountMinor", occurred_at AS "occurredAt",
                  note, tax_deductible AS "taxDeductible"`,
      [
        c.req.param('id'),
        c.get('userId'),
        body.merchant ?? null,
        body.category ?? null,
        body.amountMinor ?? null,
        body.occurredAt ?? null,
        body.note ?? null,
        body.taxDeductible ?? null,
      ]
    );
    if (!row) return c.json({ error: 'Not found' }, 404);
    return c.json(row);
  })

  .delete('/:id', async c => {
    const row = await queryOne('DELETE FROM transactions WHERE id = $1 AND user_id = $2 RETURNING id', [
      c.req.param('id'),
      c.get('userId'),
    ]);
    if (!row) return c.json({ error: 'Not found' }, 404);
    return c.body(null, 204);
  });
