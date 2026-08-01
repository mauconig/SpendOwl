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
  /**
   * What is in the account, all-time. The one figure here with no date window
   * on it — see the query below for why that is the whole point.
   */
  balanceMinor: number;
  /** Balance is negative. Replaces the old "over budget", which was calendar noise. */
  overdrawn: boolean;
  /** Everything spent this month, whatever paid for it. Feeds the donut. */
  spentMinor: number;
  /** What left the account this month: uncarded spending plus card payments. */
  accountOutMinor: number;
  /** Income received this month. Reporting only — the balance does not use it. */
  incomeMinor: number;
  daysLeft: number;
  daysInMonth: number;
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

  /**
   * The balance, and the one query here with no date filter — which is the
   * entire point of it.
   *
   * Everything above is bounded to the current calendar month, and safe-to-spend
   * used to be `income - accountOut` inside that window. On the 1st both terms
   * are zero, so it answered zero however much money existed: someone paid on
   * the 30th watched their account empty itself overnight. A balance is not a
   * monthly quantity, so it is not computed over a month.
   *
   * `card_id IS NULL` carries the same meaning as in the monthly figures above:
   * a card purchase is spending that has not been paid for yet, so it leaves
   * the balance alone until the card payment does.
   */
  const account = await queryOne<{
    openingBalanceMinor: number;
    allIncomeMinor: number;
    allAccountOutMinor: number;
  }>(
    `SELECT u.opening_balance_minor AS "openingBalanceMinor",
            COALESCE(SUM( t.amount_minor) FILTER (WHERE t.amount_minor > 0), 0)::bigint AS "allIncomeMinor",
            COALESCE(SUM(-t.amount_minor) FILTER (WHERE t.amount_minor < 0
                                                    AND t.card_id IS NULL), 0)::bigint AS "allAccountOutMinor"
       FROM users u
       LEFT JOIN transactions t ON t.user_id = u.id
      WHERE u.id = $1
      GROUP BY u.id, u.opening_balance_minor`,
    [userId]
  );

  const balanceMinor =
    (account?.openingBalanceMinor ?? 0) + (account?.allIncomeMinor ?? 0) - (account?.allAccountOutMinor ?? 0);

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

  // There is no budget figure any more, and with it go the progress bar and the
  // pace line. Both were computed from *this month's income treated as a
  // budget* — the same quantity that reset on the 1st — so on that date they
  // read 100% used and infinitely over pace. Keeping them would have left a
  // smaller copy of the bug this change exists to remove.

  return {
    month,
    balanceMinor,
    overdrawn: balanceMinor < 0,
    // Everything spent this month, whatever paid for it — the question the
    // category donut answers.
    spentMinor,
    // What left the account this month. Reporting only: the balance above is
    // all-time, so this is the month's slice of the same movement.
    accountOutMinor,
    incomeMinor,
    daysLeft: daysInMonth - dayOfMonth,
    daysInMonth,
    categories,
    trend,
  };
}
