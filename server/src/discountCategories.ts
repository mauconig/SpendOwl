/**
 * Splitting pharmacies out of the beauty/health bucket, at read time.
 *
 * The scraper's taxonomy (DISCOUNT_CATEGORIES in scraper/extract.ts) has one
 * `beauty_health` category covering pharmacies, salons, spas, barbershops,
 * aesthetic clinics and labs. In the real data that is 157 rows of which only
 * 13 are pharmacies — so a Home card headed "Pharmacy & beauty" is, in
 * practice, advertising hair salons. Someone looking for a pharmacy discount is
 * not looking for a barbershop.
 *
 * This is derived rather than scraped on purpose. Re-running extraction to add
 * a category means re-reading every promo through the model — real cost and a
 * fresh chance for it to disagree with itself — to answer a question the
 * merchant's own name already answers. Nothing is stored: `bank_discounts`
 * keeps the scraper's nine categories, and the split happens on the way out.
 *
 * DISCOUNT_CATEGORIES is imported rather than restated: this module exists to
 * describe the difference between what is stored and what is read, and it can
 * only do that if the stored list is the real one.
 *
 * Consequence worth knowing: `pharmacy` is a value the client can receive but
 * the scraper will never emit, which is why it lives in ApiDiscountCategory
 * (src/api/types.ts) and not in DISCOUNT_CATEGORIES.
 */

import { DISCOUNT_CATEGORIES } from './scraper/extract.ts';

/**
 * Every category a *reader* of `bank_discounts` can be handed: the scraper's
 * taxonomy plus the `pharmacy` split refineCategory() performs on the way out.
 *
 * Anything that lets someone filter discounts by category — the coach's
 * list_discounts tool — has to offer this list rather than the scraper's. With
 * the scraper's, asking for a pharmacy is not expressible at all, and asking for
 * `beauty_health` silently returns the pharmacies too.
 */
export const READABLE_DISCOUNT_CATEGORIES = [...DISCOUNT_CATEGORIES, 'pharmacy'] as const;

export type ReadableDiscountCategory = (typeof READABLE_DISCOUNT_CATEGORIES)[number];

/**
 * Paraguayan pharmacy chains are named with a farma/pharma stem almost without
 * exception — Farmacenter, Farmatotal, Farmalife, Farmavida, Farmavip, Blue
 * Farma, Biggie Farma, Pharmac, Farmacia Catedral. `botica` and `droguería`
 * are the other two words the trade uses.
 *
 * Matching on the name risks a false positive in a way matching on a scraped
 * label does not, so the stems are specific enough not to collide with
 * anything else in the data: no salon, spa or clinic in either bank's catalogue
 * contains one.
 */
const PHARMACY_RE = /farmac|farma|pharmac|pharma|botica|droguer/i;

/**
 * The category to show for a row, given what the scraper stored.
 *
 * Only ever refines `beauty_health` — a merchant the model already filed under
 * groceries or restaurants is not reconsidered here, because the model saw the
 * promo's full terms and this only sees a name.
 */
export function refineCategory(category: string | null, merchant: string): string | null {
  if (category !== 'beauty_health') return category;
  return PHARMACY_RE.test(merchant) ? 'pharmacy' : category;
}
