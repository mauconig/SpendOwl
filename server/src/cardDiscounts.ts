/**
 * Applying a bank's own discount to a purchase made on that bank's card.
 *
 * Paying for fuel at Petrosur on a Friday with a GNB card is 20% off, and the
 * person logging it should not have to know that, look it up, or do the
 * arithmetic. The scraped promos in `bank_discounts` already hold every part of
 * the answer — which bank, which merchant, which days, what percentage, what
 * monthly cap — so the coach can just apply it.
 *
 * Two deliberate limits:
 *
 *  · The discount is only applied when the expense is charged to a card that
 *    belongs to the bank running the promo. A discount is a property of the
 *    card, not of the shop.
 *  · Nothing is ever applied on a guess. The merchant has to match, the day has
 *    to match (via discountDays.ts, which returns 'unknown' for any phrasing it
 *    cannot fully account for), and the promo has to be currently valid.
 *    Silently taking money off an expense that did not earn it is worse than
 *    applying nothing.
 */

import { appToday, localDate } from './dates.ts';
import { query, queryOne } from './db.ts';
import { evaluateDays } from './discountDays.ts';

/**
 * Which bank a card belongs to, read from its name.
 *
 * Cards carry no bank field: the name is how a person identifies their card,
 * and someone banking with GNB calls it "GNB". Aliases cover the ways each
 * bank is actually written — GNB's cards say "Banco GNB", the co-op is
 * universally "Universitaria" rather than its full registered name.
 *
 * The obvious failure mode is a card named "Visa Platinum" matching nothing
 * and quietly getting no discounts. That is the safe direction to fail in, and
 * renaming the card fixes it; the alternative — inventing a bank — would take
 * money off purchases that never earned a discount.
 */
const BANK_ALIASES: { bank: string; patterns: RegExp }[] = [
  { bank: 'GNB', patterns: /\bgnb\b/i },
  { bank: 'Sudameris', patterns: /sudameris/i },
  { bank: 'Universitaria', patterns: /universitaria|\bcu\b|cooperativa universitaria/i },
];

export function bankForCardName(name: string): string | null {
  return BANK_ALIASES.find(b => b.patterns.test(name))?.bank ?? null;
}

/**
 * Exact match at any length, substring only past a minimum.
 *
 * Lifted from the same guard in insights.ts, and for the same reason: GNB has
 * a real merchant called "CAT", and an unguarded substring test matches it
 * against "Decathlon" — verified against a real account. A discount silently
 * applying to the wrong shop is that bug with money attached.
 */
const MIN_MATCH_LEN = 5;

function merchantMatches(promoMerchant: string, typed: string): boolean {
  const a = promoMerchant.toLowerCase().trim();
  const b = typed.toLowerCase().trim();
  if (a === b) return true;
  if (Math.min(a.length, b.length) < MIN_MATCH_LEN) return false;
  return a.includes(b) || b.includes(a);
}

type PromoRow = {
  externalId: string;
  merchant: string;
  percent: number | null;
  eligibleDays: string | null;
  monthlyCapMinor: number | null;
  description: string;
};

export type AppliedDiscount = {
  bank: string;
  /** The promo's merchant, which may be spelled differently to what was typed. */
  merchant: string;
  percent: number;
  /** Amount taken off, already capped. Always > 0 — null is returned instead. */
  discountMinor: number;
  /** True when a monthly cap trimmed this below the headline percentage. */
  cappedByMonthlyLimit: boolean;
};

/**
 * The best discount available for this purchase, or null.
 *
 * `grossMinor` is the amount before any discount, in the user's own currency —
 * the same minor units everything else on transactions uses.
 */
export async function findDiscount(
  userId: string,
  cardName: string,
  merchant: string,
  grossMinor: number,
  // The user's today. Which promos apply turns on the day of the week, so the
  // server's clock would hand out Saturday's rates on a Paraguayan Friday
  // evening — and the coach would state a discount the till will not give.
  on: Date = appToday()
): Promise<AppliedDiscount | null> {
  if (grossMinor <= 0) return null;

  const bank = bankForCardName(cardName);
  if (!bank) return null;

  const rows = await query<PromoRow>(
    `SELECT external_id AS "externalId", merchant, percent::float8 AS percent,
            eligible_days AS "eligibleDays", monthly_cap_minor AS "monthlyCapMinor", description
       FROM bank_discounts
      WHERE bank = $1
        AND percent IS NOT NULL AND percent > 0
        AND (valid_from  IS NULL OR valid_from  <= $2::date)
        AND (valid_until IS NULL OR valid_until >= $2::date)`,
    [bank, localDate(on)]
  );

  const applicable = rows
    .filter(r => merchantMatches(r.merchant, merchant))
    // 'always' counts here — unlike the Offers screen, which only wants what is
    // newsworthy today, a discount that runs every day still applies today.
    .filter(r => ['today', 'always'].includes(evaluateDays(r.eligibleDays, on)))
    .sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0));

  const best = applicable[0];
  if (!best?.percent) return null;

  let discountMinor = Math.round((grossMinor * best.percent) / 100);
  let cappedByMonthlyLimit = false;

  if (best.monthlyCapMinor != null) {
    // The cap is on eligible *spend*, not on the rebate. Both banks word it
    // "Tope de compra mensual", and GNB's Petrosur PDF spells the consequence
    // out: "Tope de compra mensual de Gs. 1.000.000 ... equivalente a un
    // reintegro máximo mensual en el extracto de Gs. 200.000". Reading it as a
    // rebate cap would hand out five times the discount that exists.
    //
    // Capping spend at C is exactly equivalent to capping the total rebate at
    // C x percent, which is the cheaper thing to check: discount_minor is
    // already summed per promo per month.
    const maxDiscountMinor = Math.round((best.monthlyCapMinor * best.percent) / 100);
    const used = await queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(discount_minor), 0)::int AS total
         FROM transactions
        WHERE user_id = $1
          AND discount_bank = $2
          AND merchant = $3
          AND occurred_at >= date_trunc('month', $4::date)::date
          AND occurred_at <= (date_trunc('month', $4::date) + INTERVAL '1 month - 1 day')::date`,
      [userId, bank, best.merchant, localDate(on)]
    );
    const remaining = Math.max(maxDiscountMinor - (used?.total ?? 0), 0);
    if (discountMinor > remaining) {
      discountMinor = remaining;
      cappedByMonthlyLimit = true;
    }
  }

  if (discountMinor <= 0) return null;

  return {
    bank,
    merchant: best.merchant,
    percent: best.percent,
    discountMinor,
    cappedByMonthlyLimit,
  };
}
