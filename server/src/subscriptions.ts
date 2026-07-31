/**
 * Reading subscriptions, with their price converted to the user's base
 * currency.
 *
 * This lives here rather than in the route for the same reason ../summary.ts
 * does: three callers need the same figure — the REST endpoint, the daily
 * insights snapshot, and the chat coach's `list_subscriptions` tool — and the
 * last two bake it straight into generated prose. Duplicating the conversion
 * would let the coach quote one number while the Dashboard draws another,
 * which is exactly the class of bug the shared-summary comment warns about.
 *
 * `price_minor` is in the subscription's *own* currency now, so anything that
 * reads it and assumes base currency is wrong by whatever the exchange rate is.
 */

import type { Currency } from './currency.ts';
import { query } from './db.ts';
import { convertMinor, getRate } from './fx.ts';

export type SubscriptionRow = {
  id: string;
  name: string;
  color: string;
  /** In `currency`, not in the user's base currency. */
  priceMinor: number;
  currency: string;
  /** Converted at today's rate. Null when no rate could be obtained. */
  priceBaseMinor: number | null;
  dayOfMonth: number;
  muted: boolean;
  off: boolean;
  cardId: string | null;
  cardName: string | null;
};

// The column is `cancelled`, but the client's store has always called this
// `off` — aliased so useSpendOwl()'s surface doesn't change.
const SELECT = `
  SELECT s.id,
         s.name,
         s.color,
         s.price_minor  AS "priceMinor",
         s.currency,
         s.day_of_month AS "dayOfMonth",
         s.muted,
         s.cancelled    AS off,
         s.card_id      AS "cardId",
         c.name         AS "cardName"
    FROM subscriptions s
    LEFT JOIN credit_cards c ON c.id = s.card_id
   WHERE s.user_id = $1
`;

/**
 * One rate lookup per distinct currency rather than per row — `getRate` reads
 * from the cached fx_rates table, but a user with a dozen USD subscriptions
 * shouldn't produce a dozen identical queries.
 */
async function attachBasePrice(
  rows: Omit<SubscriptionRow, 'priceBaseMinor'>[],
  base: Currency
): Promise<SubscriptionRow[]> {
  const rates = new Map<string, number | null>();
  for (const cur of new Set(rows.map(r => r.currency))) {
    rates.set(cur, await getRate(cur as Currency, base));
  }
  return rows.map(r => {
    const rate = rates.get(r.currency) ?? null;
    return {
      ...r,
      // Null rather than a guess: the client shows the native price alone, and
      // nothing downstream ever quotes a converted figure that wasn't real.
      priceBaseMinor: rate == null ? null : convertMinor(r.priceMinor, r.currency as Currency, base, rate),
    };
  });
}

/** Renewal-day order, matching what the subscriptions sheet expects. */
export async function listSubscriptions(userId: string, base: Currency): Promise<SubscriptionRow[]> {
  const rows = await query<Omit<SubscriptionRow, 'priceBaseMinor'>>(`${SELECT} ORDER BY s.day_of_month`, [userId]);
  return attachBasePrice(rows, base);
}

/** Priciest first — what the coach and the insights snapshot want to lead with. */
export async function listSubscriptionsByPrice(userId: string, base: Currency): Promise<SubscriptionRow[]> {
  const rows = await query<Omit<SubscriptionRow, 'priceBaseMinor'>>(`${SELECT} ORDER BY s.price_minor DESC`, [userId]);
  return attachBasePrice(rows, base);
}
