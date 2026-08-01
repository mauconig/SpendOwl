import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../auth.ts';
import { query, queryOne } from '../db.ts';

const SELECT = `
  SELECT base_currency        AS "baseCurrency",
         monthly_budget_minor AS "monthlyBudgetMinor",
         language,
         notif,
         bio
  FROM users
`;

const updateSchema = z.object({
  baseCurrency: z.enum(['EUR', 'USD', 'PYG']).optional(),
  monthlyBudgetMinor: z.int().positive().optional(),
  language: z.enum(['en', 'es']).optional(),
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
              language             = COALESCE($4, language),
              notif                = COALESCE($5, notif),
              bio                  = COALESCE($6, bio)
        WHERE id = $1
        RETURNING base_currency AS "baseCurrency", monthly_budget_minor AS "monthlyBudgetMinor",
                  language, notif, bio`,
      [
        c.get('userId'),
        body.baseCurrency ?? null,
        body.monthlyBudgetMinor ?? null,
        body.language ?? null,
        body.notif ?? null,
        body.bio ?? null,
      ]
    );
    if (!row) return c.json({ error: 'User not provisioned' }, 404);

    // Today's "For you" cards were written by a model in the old language and
    // are cached per user per day, so without this the home screen would keep
    // showing English cards under a Spanish UI until tomorrow.
    if (body.language) {
      await query(`DELETE FROM insights WHERE user_id = $1`, [c.get('userId')]);
    }

    return c.json(row);
  });
