/**
 * Foreign exchange rates.
 *
 * This is the piece [currency.ts](./currency.ts) says is missing. That file is
 * explicit that it converts *nothing* — the app once rendered every amount
 * through a hardcoded EUR/USD/PYG table of invented demo values, which added
 * error while implying an accuracy the app did not have. So the rule here is
 * the same one that motivated ripping that table out: **never return a rate
 * that was not actually observed.** When no real rate can be found this returns
 * null and the caller declines to act, rather than falling back to a guess.
 *
 * Source is open.er-api.com: free, no API key, updated daily, and — unlike the
 * ECB-backed alternatives (Frankfurter and friends) — it actually quotes
 * Guaraní, which is the only reason this feature is possible at all.
 */

import { CURRENCIES, type Currency } from './currency.ts';
import { localDate } from './dates.ts';
import { query, queryOne } from './db.ts';

const ENDPOINT = 'https://open.er-api.com/v6/latest/USD';
const TIMEOUT_MS = 8000;

/** Rates are quoted per 1 USD, which is what the endpoint returns natively. */
const PIVOT: Currency = 'USD';

type RateRow = { rate: number };

// Local calendar day, never the UTC one — see dates.ts. A charge dated the 31st
// must look up the 31st's rate, not the 30th's.
const iso = localDate;

/**
 * Today's USD legs, fetched at most once per day.
 *
 * The guard is the table itself rather than an in-process flag: the server
 * restarts on deploy, and `/api/summary` is hit constantly, so anything held
 * only in memory would turn into a fetch per restart.
 */
async function ensureRatesFor(today: string): Promise<void> {
  const existing = await queryOne<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM fx_rates WHERE as_of = $1 AND base = $2`,
    [today, PIVOT]
  );
  if ((existing?.count ?? 0) > 0) return;

  let payload: { rates?: Record<string, unknown> };
  try {
    const res = await fetch(ENDPOINT, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    payload = (await res.json()) as { rates?: Record<string, unknown> };
  } catch (err) {
    // Not fatal, and deliberately not rethrown: the caller falls back to the
    // most recent rate it already has. A stale rate from yesterday is a far
    // better answer than failing a request the user made about their budget.
    console.warn('[fx] rate fetch failed, falling back to last known:', err instanceof Error ? err.message : err);
    return;
  }

  const rates = payload.rates ?? {};
  const rows = CURRENCIES.map(cur => ({ cur, rate: rates[cur] })).filter(
    (r): r is { cur: Currency; rate: number } => typeof r.rate === 'number' && Number.isFinite(r.rate) && r.rate > 0
  );

  // All or nothing. A partial write would leave one currency quoted for today
  // and another silently resolving to an older date, which is the kind of
  // mismatch that produces a wrong number nobody can explain later.
  if (rows.length !== CURRENCIES.length) {
    console.warn(`[fx] response missing currencies (got ${rows.map(r => r.cur).join(',')}), not caching`);
    return;
  }

  for (const { cur, rate } of rows) {
    await query(
      `INSERT INTO fx_rates (as_of, base, quote, rate) VALUES ($1, $2, $3, $4)
       ON CONFLICT (as_of, base, quote) DO UPDATE SET rate = EXCLUDED.rate`,
      [today, PIVOT, cur, rate]
    );
  }
}

/**
 * The USD leg for one currency, as close to `onOrBefore` as the cache allows.
 *
 * The second query is what makes catch-up charging possible at all. A renewal
 * being backfilled for three months ago predates every row in a cache that only
 * started filling today, so an `as_of <= date` lookup finds nothing — and since
 * that will still be true tomorrow, the charge would be skipped *forever* rather
 * than merely being late. Falling back to the oldest rate on file is still a
 * real observed rate, just not one observed on that exact day, and the
 * transaction records which rate it used.
 */
async function usdLeg(quote: Currency, onOrBefore: string): Promise<number | null> {
  const asOf = await queryOne<RateRow>(
    `SELECT rate::float8 AS rate FROM fx_rates
      WHERE base = $1 AND quote = $2 AND as_of <= $3
      ORDER BY as_of DESC LIMIT 1`,
    [PIVOT, quote, onOrBefore]
  );
  if (asOf) return asOf.rate;

  const earliest = await queryOne<RateRow>(
    `SELECT rate::float8 AS rate FROM fx_rates
      WHERE base = $1 AND quote = $2
      ORDER BY as_of ASC LIMIT 1`,
    [PIVOT, quote]
  );
  return earliest?.rate ?? null;
}

/**
 * How many units of `to` one unit of `from` buys.
 *
 * Returns null when no observed rate exists for either leg — the caller must
 * treat that as "cannot convert yet", not as zero and not as one.
 */
export async function getRate(from: Currency, to: Currency, onDate: Date = new Date()): Promise<number | null> {
  if (from === to) return 1;

  const date = iso(onDate);
  // Always seeded against today, whatever date is being asked about: on a
  // fresh install the cache is empty, so a backdated conversion has nothing to
  // read until *some* fetch has happened. ensureRatesFor is a no-op once
  // today's rows exist, so this stays at one network call per day.
  await ensureRatesFor(iso(new Date()));

  // Cross rate through USD: PYG per USD ÷ EUR per USD = PYG per EUR.
  const [fromLeg, toLeg] = await Promise.all([usdLeg(from, date), usdLeg(to, date)]);
  if (fromLeg == null || toLeg == null || fromLeg === 0) return null;
  return toLeg / fromLeg;
}

/**
 * Convert between currencies in minor units, respecting that each currency's
 * minor unit differs — the cent for EUR/USD, the whole guaraní for PYG. Going
 * through the display value is what keeps 999 USD cents from being read as 999
 * guaraníes. See minorToDisplay/displayToMinor in currency.ts.
 */
export function convertMinor(minor: number, from: Currency, to: Currency, rate: number): number {
  const fromDecimals = from === 'PYG' ? 1 : 100;
  const toDecimals = to === 'PYG' ? 1 : 100;
  return Math.round((minor / fromDecimals) * rate * toDecimals);
}
