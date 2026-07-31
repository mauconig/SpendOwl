import type { ApiDiscount, ApiDiscountCategory } from '../api/types';

/**
 * Presentation and grouping for scraped bank discounts.
 *
 * The Spanish day parsing that used to live here now runs on the server
 * (server/src/discountDays.ts) and arrives as `activeToday` / `weekdayCount`
 * on each row. It moved because a second consumer appeared: an expense charged
 * to a bank's card gets that bank's discount applied automatically, and the day
 * a discount runs has to mean the same thing to both. Two copies of a parser
 * that decides how much money comes off a purchase is not a duplication worth
 * having.
 */

/**
 * The scraper's DISCOUNT_CATEGORIES, plus `pharmacy` — which the server derives
 * from the merchant's name on the way out (server/src/discountCategories.ts)
 * because the scraped bucket lumped 13 real pharmacies in with 144 salons.
 */
export const CATEGORY_LABELS: Record<ApiDiscountCategory, string> = {
  groceries: 'Supermarkets & Groceries',
  restaurants: 'Restaurants & Food',
  fashion: 'Fashion & Accessories',
  beauty_health: 'Beauty & Wellness',
  pharmacy: 'Pharmacies',
  home: 'Home & Furniture',
  electronics: 'Electronics & Media',
  auto_fuel: 'Automotive & Fuel',
  entertainment_travel: 'Entertainment & Travel',
  other: 'Other / Services',
};

/** The same set, short enough to headline a Home card. */
export const CATEGORY_SHORT: Record<ApiDiscountCategory, string> = {
  groceries: 'Supermarkets',
  restaurants: 'Restaurants',
  fashion: 'Fashion',
  beauty_health: 'Beauty & spa',
  pharmacy: 'Pharmacies',
  home: 'Home',
  electronics: 'Electronics',
  auto_fuel: 'Fuel & auto',
  entertainment_travel: 'Entertainment',
  other: 'Services',
};

/**
 * Chip order on Offers, most-used first — not alphabetical and not whatever
 * order the rows happen to come back in. Anything missing sorts to the end.
 */
export const CATEGORY_ORDER: ApiDiscountCategory[] = [
  'auto_fuel',
  'restaurants',
  'pharmacy',
  'beauty_health',
  'groceries',
  'fashion',
  'home',
  'electronics',
  'entertainment_travel',
  'other',
];

/** Accent per category, same principle as HomeScreen's ICON_COLORS. */
export const CATEGORY_COLORS: Record<ApiDiscountCategory, string> = {
  groceries: '#7AC77A',
  restaurants: '#F2A65A',
  fashion: '#D98BC8',
  beauty_health: '#78ADEE',
  pharmacy: '#5EC8B0',
  home: '#C4A87A',
  electronics: '#8FD4D4',
  auto_fuel: '#E8845C',
  entertainment_travel: '#A99BE8',
  other: '#9AA3AE',
};

/**
 * What to show in an offer's top-right slot.
 *
 * A "cuotas sin intereses" promo carries no discount, and the scraper records
 * that literally as `percent: 0` — which the offer card used to render as a
 * flat "0%", the least useful thing it could say. The number that actually
 * matters there is the instalment count.
 */
export function offerBadge(d: Pick<ApiDiscount, 'percent' | 'installments'>): { value: string; note?: string } | null {
  if (d.percent != null && d.percent > 0) return { value: `${d.percent}%` };
  if (d.installments != null && d.installments > 0) return { value: `${d.installments}x`, note: 'sin interés' };
  return null;
}

export type TodayOfferGroup = {
  category: ApiDiscountCategory;
  offers: ApiDiscount[];
  /** Highest discount in the group, for the card's one-line summary. */
  bestPercent: number | null;
};

/**
 * Gas and pharmacies lead; everything else earns its slot by being narrow.
 * `pharmacy`, not `beauty_health` — the point of that split is that a "fuel and
 * pharmacies today" card should not be filled with barbershops.
 */
const LEAD_CATEGORIES: ApiDiscountCategory[] = ['auto_fuel', 'pharmacy'];
const MAX_GROUPS = 4;

/**
 * The day-restricted offers that are live today, grouped into at most four
 * cards so Home stays readable. Offers with no day restriction are excluded on
 * purpose: they're true every day, so they aren't news — which is why this
 * keys off `activeToday` rather than merely "valid".
 */
export function todaysOfferGroups(discounts: ApiDiscount[]): TodayOfferGroup[] {
  const live = discounts.filter(d => d.activeToday);

  const byCategory = new Map<ApiDiscountCategory, ApiDiscount[]>();
  for (const d of live) {
    const key = d.category ?? 'other';
    const list = byCategory.get(key);
    if (list) list.push(d);
    else byCategory.set(key, [d]);
  }

  return [...byCategory.entries()]
    .map(([category, offers]) => ({
      category,
      offers: [...offers].sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0)),
      bestPercent: offers.reduce<number | null>((max, o) => (o.percent != null && o.percent > (max ?? 0) ? o.percent : max), null),
      // The narrowest restriction in the group is what makes it notable — one
      // Wednesday-only station beats a category that merely happens to include
      // something running all weekend.
      narrowness: Math.min(...offers.map(o => o.weekdayCount)),
    }))
    .sort((a, b) => {
      const lead = leadRank(a.category) - leadRank(b.category);
      if (lead !== 0) return lead;
      if (a.narrowness !== b.narrowness) return a.narrowness - b.narrowness;
      return b.offers.length - a.offers.length;
    })
    .slice(0, MAX_GROUPS)
    .map(({ category, offers, bestPercent }) => ({ category, offers, bestPercent }));
}

function leadRank(c: ApiDiscountCategory): number {
  const i = LEAD_CATEGORIES.indexOf(c);
  return i === -1 ? LEAD_CATEGORIES.length : i;
}
