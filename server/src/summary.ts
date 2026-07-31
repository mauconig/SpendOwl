import { query, queryOne } from './db.ts';

/**
 * Everything the Dashboard and Home screens used to hardcode: the safe-to-spend
 * hero, the budget progress bar, the "under pace" line, the donut's category
 * totals, and the trend chart's cumulative series. All of it is SUM()ed from
 * real rows for the current calendar month.
 *
 * This lives here rather than in the route because the chat coach's
 * `get_budget_summary` tool answers from the same numbers. Duplicating the SQL
 * would recreate exactly the bug the summary endpoint exists to prevent — two
 * sources of truth for the same figure that drift apart.
 *
 * The 'debt' slice is intentionally absent — it is monthly card interest, which
 * the client derives from credit_cards via cardInterestMonthly() in
 * src/utils/payoff.ts.
 */
export type Summary = {
  month: string;
  budgetMinor: number;
  spentMinor: number;
  accountOutMinor: number;
  incomeMinor: number;
  safeToSpendMinor: number;
  overBudget: boolean;
  percentOfBudget: number;
  daysLeft: number;
  daysInMonth: number;
  paceDeltaMinor: number;
  pacePercent: number;
  categories: { key: string; spentMinor: number }[];
  trend: { day: string; cumulativeMinor: number }[];
};

/** Null when the user row does not exist yet (seeding has not run). */
export async function getSummary(userId: string): Promise<Summary | null> {
  const totals = await queryOne<{
    spentMinor: number;
    accountOutMinor: number;
    incomeMinor: number;
    dayOfMonth: number;
    daysInMonth: number;
    month: string;
  }>(
    `SELECT COALESCE(SUM(-t.amount_minor) FILTER (WHERE t.amount_minor < 0), 0)::bigint AS "spentMinor",
            -- Money that actually left the account, which is not the same as
            -- money spent. Buying on a credit card spends without touching the
            -- account: it raises what the card is owed, and the account is only
            -- debited later, when the card is paid. Those two events are
            -- card_id IS NOT NULL and card_id IS NULL respectively, so
            -- excluding carded rows here counts each once, at the right moment.
            COALESCE(SUM(-t.amount_minor) FILTER (WHERE t.amount_minor < 0 AND t.card_id IS NULL), 0)::bigint
              AS "accountOutMinor",
            COALESCE(SUM( t.amount_minor) FILTER (WHERE t.amount_minor > 0), 0)::bigint AS "incomeMinor",
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
      GROUP BY u.id`,
    [userId]
  );

  if (!totals) return null;

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

  const { spentMinor, accountOutMinor, incomeMinor, dayOfMonth, daysInMonth, month } = totals;

  // What you earned this month is the baseline, not a stored budget figure.
  //
  // `users.monthly_budget_minor` is no longer read here. Nothing in the app
  // ever set it — there is no control for it on any screen — so every account
  // carried the column default, and the Dashboard announced a "safe to spend"
  // derived from a number the user had never seen, let alone chosen. Income is
  // summed from the user's own income transactions, so the figure is either
  // real or zero; zero is honest, an invented 240.000 is not.
  const budgetMinor = incomeMinor;

  // Pace compares what has left the account against a flat run-rate across the
  // month. Positive delta means under pace.
  const expectedByNowMinor = Math.round((budgetMinor * dayOfMonth) / daysInMonth);
  const paceDeltaMinor = expectedByNowMinor - accountOutMinor;

  return {
    month,
    budgetMinor,
    // Everything spent this month, whatever paid for it — the question the
    // category donut answers.
    spentMinor,
    // What is gone from the account. Everything about "how much is left"
    // hangs off this one, never off spentMinor: a card purchase is spending
    // that has not been paid for yet, and counting it here would take it off
    // the account twice, once at the till and again on the statement.
    accountOutMinor,
    incomeMinor,
    safeToSpendMinor: incomeMinor - accountOutMinor,
    // With no income logged there is nothing to be over, so a first coffee on a
    // fresh account must not light up the over-budget warning.
    overBudget: incomeMinor > 0 && accountOutMinor > incomeMinor,
    percentOfBudget: budgetMinor > 0 ? (accountOutMinor / budgetMinor) * 100 : 0,
    daysLeft: daysInMonth - dayOfMonth,
    daysInMonth,
    paceDeltaMinor,
    pacePercent: expectedByNowMinor > 0 ? (paceDeltaMinor / expectedByNowMinor) * 100 : 0,
    categories,
    trend,
  };
}
