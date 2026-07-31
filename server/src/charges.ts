/**
 * Turns subscriptions into real transactions.
 *
 * Until this existed, a subscription charged nothing: getSummary() sums
 * `FROM transactions` only, so a month of subscriptions was invisible to spend,
 * budget, pace, the donut and the trend line. A subscription is now a template
 * that stamps out one ordinary transaction per month, converted at that month's
 * rate and then frozen — because the converted figure is what actually left the
 * account, and it must not change later when the guaraní moves.
 *
 * **Lazy catch-up, not cron.** This runs on read. There is no scheduler on the
 * server, and adding one would mean a charge is simply lost if the box happens
 * to be restarting when the timer fires — silently, with nothing to retry it.
 * Running on read is self-healing: whatever is missing is filled in the next
 * time the app is opened, however late that is.
 *
 * Safety comes from the database, not from this file: the partial unique index
 * `transactions_sub_period_idx` is what makes a second charge for the same
 * (subscription, month) impossible, so this being called on every request is
 * fine.
 */

import { getUserCurrency, type Currency } from './currency.ts';
import { localDate, localPeriod } from './dates.ts';
import { query, transaction } from './db.ts';
import { convertMinor, getRate } from './fx.ts';

/**
 * Subscriptions are recurring bills, and CATS.bills in src/theme.ts is
 * literally labelled "Bills & Subs" — so every generated charge lands there.
 */
const CATEGORY = 'bills';

type SubRow = {
  id: string;
  name: string;
  priceMinor: number;
  currency: string;
  dayOfMonth: number;
  cardId: string | null;
  chargeStart: string;
};

const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

/**
 * Every month this subscription should have charged, from charge_start to
 * today. The charge day is clamped to the month's length, so a subscription
 * that renews on the 31st bills on the 28th in February rather than skipping
 * February altogether.
 */
export function duePeriods(sub: SubRow, today: Date): { period: string; on: Date }[] {
  const start = new Date(`${sub.chargeStart}T00:00:00`);
  const due: { period: string; on: Date }[] = [];

  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const limit = new Date(today.getFullYear(), today.getMonth(), 1);

  while (cursor <= limit) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const on = new Date(year, month, Math.min(sub.dayOfMonth, daysInMonth(year, month)));
    // Not before the subscription started, and not in the future — a renewal
    // later this month has not happened yet.
    if (on >= start && on <= today) due.push({ period: localPeriod(on), on });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return due;
}

/**
 * Writes any subscription charges that are due and not yet recorded.
 *
 * Never throws for a rate it could not obtain: that subscription is skipped and
 * picked up on a later call, which is recoverable. Charging at an invented rate
 * would not be — it writes a wrong number into spend history permanently.
 */
export async function materializeDueCharges(userId: string): Promise<void> {
  const subs = await query<SubRow>(
    `SELECT id, name, price_minor AS "priceMinor", currency,
            day_of_month AS "dayOfMonth", card_id AS "cardId",
            to_char(charge_start, 'YYYY-MM-DD') AS "chargeStart"
       FROM subscriptions
      WHERE user_id = $1 AND cancelled = FALSE`,
    [userId]
  );
  if (subs.length === 0) return;

  const base = await getUserCurrency(userId);
  const today = new Date();

  for (const sub of subs) {
    const due = duePeriods(sub, today);
    if (due.length === 0) continue;

    for (const { period, on } of due) {
      const rate = await getRate(sub.currency as Currency, base, on);
      if (rate == null) {
        console.warn(`[charges] no rate for ${sub.currency}->${base} on ${period}, skipping ${sub.name}`);
        continue;
      }

      const amountMinor = convertMinor(sub.priceMinor, sub.currency as Currency, base, rate);

      await transaction(async client => {
        // ON CONFLICT DO NOTHING against the partial unique index is the whole
        // idempotency story — and `RETURNING id` is how we learn whether this
        // call was the one that actually wrote the row, so the card balance
        // below moves exactly once rather than on every read.
        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO transactions
             (user_id, merchant, category, amount_minor, occurred_at, note,
              subscription_id, charge_period, original_minor, original_currency, fx_rate)
           VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (subscription_id, charge_period) WHERE subscription_id IS NOT NULL
             DO NOTHING
           RETURNING id`,
          [
            userId,
            sub.name,
            CATEGORY,
            -amountMinor,
            // localDate, not toISOString: `on` is local midnight, and this
            // server is UTC+2, so the UTC form is the previous day.
            localDate(on),
            'Subscription',
            sub.id,
            period,
            sub.priceMinor,
            sub.currency,
            rate,
          ]
        );

        if (rows.length === 0 || !sub.cardId) return;

        // Same effect as the chat-approval path's chargeCard: the money is
        // spent *and* the card now owes more.
        await client.query(
          `UPDATE credit_cards SET balance_minor = balance_minor + $3 WHERE id = $1 AND user_id = $2`,
          [sub.cardId, userId, amountMinor]
        );
      });
    }
  }
}
