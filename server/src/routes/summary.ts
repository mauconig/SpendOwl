import { Hono } from 'hono';
import type { AppEnv } from '../auth.ts';
import { query, queryOne } from '../db.ts';

/**
 * Everything the Dashboard and Home screens used to hardcode: the safe-to-spend
 * hero, the budget progress bar, the "under pace" line, the donut's category
 * totals, and the trend chart's cumulative series. All of it is now SUM()ed
 * from real rows for the current calendar month.
 *
 * The 'debt' slice is intentionally absent — it is monthly card interest, which
 * the client already derives from credit_cards via cardInterestMonthly()
 * in src/utils/payoff.ts.
 */
export const summaryRoute = new Hono<AppEnv>().get('/', async c => {
  const userId = c.get('userId');

  const totals = await queryOne<{
    spentMinor: number;
    incomeMinor: number;
    budgetMinor: number;
    dayOfMonth: number;
    daysInMonth: number;
    month: string;
  }>(
    `SELECT COALESCE(SUM(-t.amount_minor) FILTER (WHERE t.amount_minor < 0), 0)::bigint AS "spentMinor",
            COALESCE(SUM( t.amount_minor) FILTER (WHERE t.amount_minor > 0), 0)::bigint AS "incomeMinor",
            u.monthly_budget_minor                                                      AS "budgetMinor",
            EXTRACT(DAY FROM CURRENT_DATE)::int                                         AS "dayOfMonth",
            EXTRACT(DAY FROM (date_trunc('month', CURRENT_DATE)
                              + INTERVAL '1 month - 1 day'))::int                       AS "daysInMonth",
            to_char(CURRENT_DATE, 'YYYY-MM')                                            AS "month"
       FROM users u
       LEFT JOIN transactions t
         ON t.user_id = u.id
        AND t.occurred_at >= date_trunc('month', CURRENT_DATE)::date
        AND t.occurred_at <= CURRENT_DATE
      WHERE u.id = $1
      GROUP BY u.monthly_budget_minor`,
    [userId]
  );

  if (!totals) return c.json({ error: 'User not provisioned' }, 404);

  const categories = await query<{ key: string; spentMinor: number }>(
    `SELECT category AS key, SUM(-amount_minor)::bigint AS "spentMinor"
       FROM transactions
      WHERE user_id = $1
        AND amount_minor < 0
        AND occurred_at >= date_trunc('month', CURRENT_DATE)::date
        AND occurred_at <= CURRENT_DATE
      GROUP BY category
      ORDER BY "spentMinor" DESC`,
    [userId]
  );

  // One row per elapsed day of the month, including days with no spend, so the
  // trend line has an even x-axis instead of gaps.
  const trend = await query<{ day: string; cumulativeMinor: number }>(
    `WITH days AS (
       SELECT generate_series(date_trunc('month', CURRENT_DATE)::date, CURRENT_DATE, '1 day')::date AS day
     ),
     daily AS (
       SELECT d.day,
              COALESCE(SUM(-t.amount_minor) FILTER (WHERE t.amount_minor < 0), 0) AS spend
         FROM days d
         LEFT JOIN transactions t
           ON t.user_id = $1 AND t.occurred_at = d.day
        GROUP BY d.day
     )
     SELECT day, SUM(spend) OVER (ORDER BY day)::bigint AS "cumulativeMinor"
       FROM daily
      ORDER BY day`,
    [userId]
  );

  const { spentMinor, incomeMinor, budgetMinor, dayOfMonth, daysInMonth, month } = totals;

  // Pace compares actual spend against a flat run-rate of the budget across the
  // month. Positive delta means under pace.
  const expectedByNowMinor = Math.round((budgetMinor * dayOfMonth) / daysInMonth);
  const paceDeltaMinor = expectedByNowMinor - spentMinor;

  return c.json({
    month,
    budgetMinor,
    spentMinor,
    incomeMinor,
    safeToSpendMinor: budgetMinor - spentMinor,
    overBudget: spentMinor > budgetMinor,
    percentOfBudget: budgetMinor > 0 ? (spentMinor / budgetMinor) * 100 : 0,
    daysLeft: daysInMonth - dayOfMonth,
    daysInMonth,
    paceDeltaMinor,
    pacePercent: expectedByNowMinor > 0 ? (paceDeltaMinor / expectedByNowMinor) * 100 : 0,
    categories,
    trend,
  });
});
