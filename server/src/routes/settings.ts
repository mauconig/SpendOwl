import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../auth.ts';
import { queryOne } from '../db.ts';

const SELECT = `
  SELECT base_currency        AS "baseCurrency",
         monthly_budget_minor AS "monthlyBudgetMinor",
         notif,
         bio
  FROM users
`;

const updateSchema = z.object({
  baseCurrency: z.enum(['EUR', 'USD', 'PYG']).optional(),
  monthlyBudgetMinor: z.int().positive().optional(),
  notif: z.boolean().optional(),
  bio: z.boolean().optional(),
});

export const settingsRoute = new Hono<AppEnv>()

  .get('/', async c => {
    const row = await queryOne(`${SELECT} WHERE id = $1`, [c.get('userId')]);
    if (!row) return c.json({ error: 'User not provisioned' }, 404);
    return c.json(row);
  })

  .patch('/', async c => {
    const parsed = updateSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid body', issues: parsed.error.issues }, 400);
    const body = parsed.data;

    const row = await queryOne(
      `UPDATE users
          SET base_currency        = COALESCE($2, base_currency),
              monthly_budget_minor = COALESCE($3, monthly_budget_minor),
              notif                = COALESCE($4, notif),
              bio                  = COALESCE($5, bio)
        WHERE id = $1
        RETURNING base_currency AS "baseCurrency", monthly_budget_minor AS "monthlyBudgetMinor", notif, bio`,
      [
        c.get('userId'),
        body.baseCurrency ?? null,
        body.monthlyBudgetMinor ?? null,
        body.notif ?? null,
        body.bio ?? null,
      ]
    );
    if (!row) return c.json({ error: 'User not provisioned' }, 404);
    return c.json(row);
  });
