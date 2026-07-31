import { Hono } from 'hono';
import type { AppEnv } from '../auth.ts';
import { query } from '../db.ts';
import { eligibleWeekdayCount, evaluateDays } from '../discountDays.ts';

/**
 * Read-only list of currently-valid bank discounts for the Offers screen.
 * Global, not user-scoped — every account sees the same rows, populated by
 * server/src/scraper/import.ts. No POST here: there's nothing for a client
 * to write, and refreshing the data is a manual scrape+import cycle, not an
 * API call (see scraper/scrape.ts).
 */

type DiscountRow = {
  bank: string;
  merchant: string;
  category: string | null;
  percent: number | null;
  installments: number | null;
  eligibleDays: string | null;
  monthlyCapMinor: number | null;
  validUntil: string | null;
  description: string;
};

/**
 * eligible_days is free-text Spanish, and parsing it is what decides both
 * which offers Home surfaces today and whether a discount is applied to a real
 * expense. Resolving it here rather than in the client is what keeps those two
 * answers from ever disagreeing — see ../discountDays.ts.
 */
type Resolved = DiscountRow & { activeToday: boolean; weekdayCount: number };

export const discountsRoute = new Hono<AppEnv>().get('/', async c => {
  // percent is NUMERIC, which node-postgres otherwise returns as a string.
  const rows = await query<DiscountRow>(
    `SELECT bank, merchant, category, percent::float8 AS percent, installments,
            eligible_days AS "eligibleDays", monthly_cap_minor AS "monthlyCapMinor",
            valid_until AS "validUntil", description
       FROM bank_discounts
      WHERE valid_until IS NULL OR valid_until >= CURRENT_DATE
      ORDER BY percent DESC NULLS LAST, merchant`
  );

  const now = new Date();
  const resolved: Resolved[] = rows.map(r => ({
    ...r,
    // 'always' is not "today": a discount with no day restriction runs every
    // day, so it is never news on the Home screen. Only an explicit match
    // counts. 'unknown' deliberately falls on the false side.
    activeToday: evaluateDays(r.eligibleDays, now) === 'today',
    weekdayCount: eligibleWeekdayCount(r.eligibleDays),
  }));

  return c.json({ discounts: resolved });
});
