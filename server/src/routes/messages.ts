import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../auth.ts';
import { query, queryOne } from '../db.ts';

// 'scanning' is not a persisted kind — it is the transient laser animation the
// client shows while a receipt "uploads", and it is replaced by a 'card'
// message when the (currently fake) scan resolves.
const createSchema = z.object({
  kind: z.enum(['ai', 'user', 'voice', 'receipt', 'card']),
  payload: z.record(z.string(), z.unknown()).default({}),
});

const SELECT = `SELECT id, kind, payload, created_at AS "createdAt" FROM messages`;

export const messagesRoute = new Hono<AppEnv>()

  .get('/', async c => {
    const rows = await query(`${SELECT} WHERE user_id = $1 ORDER BY created_at`, [c.get('userId')]);
    return c.json(rows);
  })

  .post('/', async c => {
    const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid body', issues: parsed.error.issues }, 400);
    const body = parsed.data;

    const row = await queryOne(
      `INSERT INTO messages (user_id, kind, payload)
       VALUES ($1, $2, $3)
       RETURNING id, kind, payload, created_at AS "createdAt"`,
      [c.get('userId'), body.kind, JSON.stringify(body.payload)]
    );
    return c.json(row, 201);
  });
