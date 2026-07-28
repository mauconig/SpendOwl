import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../auth.ts';
import { query, queryOne } from '../db.ts';

const SELECT = `
  SELECT id,
         merchant,
         amount_minor AS "amountMinor",
         occurred_at  AS "occurredAt",
         status,
         category
  FROM receipts
`;

const createSchema = z.object({
  merchant: z.string().trim().min(1).max(120),
  amountMinor: z.int(),
  category: z.string().trim().min(1).max(60),
  occurredAt: z.iso.date().optional(),
  status: z.enum(['ok', 'warn']).optional(),
});

// Approving an invoice clears its needs-review flag. Today `status` is decided
// by the fake scanner; once real OCR lands it becomes an extraction-confidence
// check (see .docs/BACKEND.md).
const updateSchema = z.object({ status: z.enum(['ok', 'warn']) });

export const receiptsRoute = new Hono<AppEnv>()

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
      `INSERT INTO receipts (user_id, merchant, amount_minor, occurred_at, status, category)
       VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE), COALESCE($5, 'ok'), $6)
       RETURNING id, merchant, amount_minor AS "amountMinor", occurred_at AS "occurredAt", status, category`,
      [c.get('userId'), body.merchant, body.amountMinor, body.occurredAt ?? null, body.status ?? null, body.category]
    );
    return c.json(row, 201);
  })

  .patch('/:id', async c => {
    const parsed = updateSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid body', issues: parsed.error.issues }, 400);

    const row = await queryOne(
      `UPDATE receipts SET status = $3
        WHERE id = $1 AND user_id = $2
        RETURNING id, merchant, amount_minor AS "amountMinor", occurred_at AS "occurredAt", status, category`,
      [c.req.param('id'), c.get('userId'), parsed.data.status]
    );
    if (!row) return c.json({ error: 'Not found' }, 404);
    return c.json(row);
  });
