import { Hono } from 'hono';
import type { AppEnv } from '../auth.ts';
import { query } from '../db.ts';

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
  return c.json({ discounts: rows });
});
