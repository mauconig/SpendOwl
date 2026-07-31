import type { ApiDiscount, ApiDiscountCategory } from '../api/types';

/**
 * `eligibleDays` on a scraped discount is free-text Spanish lifted straight out
 * of a bank's Bases y Condiciones PDF — "miércoles a domingos", "primer y
 * último jueves de cada mes", "del 1 al 10 de cada mes". The scraper doesn't
 * normalise it (the phrasing is worth showing verbatim on the offer card), so
 * anything that needs to know *whether an offer is live today* has to read it
 * here.
 *
 * The parser is deliberately conservative: a phrase it cannot fully account for
 * returns 'unknown' rather than a guess, and callers that surface "today only"
 * offers drop those. Claiming a discount exists on a day it doesn't is worse
 * than staying quiet.
 */

// 0 = Sunday, matching Date#getDay.
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Mirrors server/src/scraper/extract.ts's DISCOUNT_CATEGORIES. */
export const CATEGORY_LABELS: Record<ApiDiscountCategory, string> = {
  groceries: 'Supermarkets & Groceries',
  restaurants: 'Restaurants & Food',
  fashion: 'Fashion & Accessories',
  beauty_health: 'Beauty & Health',
  home: 'Home & Furniture',
  electronics: 'Electronics & Media',
  auto_fuel: 'Automotive & Fuel',
  entertainment_travel: 'Entertainment & Travel',
  other: 'Other / Services',
};

/** The same nine, short enough to headline a Home card. */
export const CATEGORY_SHORT: Record<ApiDiscountCategory, string> = {
  groceries: 'Supermarkets',
  restaurants: 'Restaurants',
  fashion: 'Fashion',
  beauty_health: 'Pharmacy & beauty',
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
  home: '#C4A87A',
  electronics: '#8FD4D4',
  auto_fuel: '#E8845C',
  entertainment_travel: '#A99BE8',
  other: '#9AA3AE',
};

const ACCENTS: Record<string, string> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n' };

// Hand-rolled rather than String#normalize('NFD'): Hermes' Unicode support has
// been uneven, and only these seven characters ever appear here.
const norm = (s: string) => s.toLowerCase().replace(/[áéíóúüñ]/g, c => ACCENTS[c] ?? c);

const DAY_NAMES: Record<string, Weekday> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
};

/**
 * Words that carry no day information but legitimately appear in these
 * phrases. Anything outside this set (and outside day names and numbers) means
 * the phrase says something the parser doesn't model, so the verdict is
 * 'unknown' — that's the guard that keeps a new, unfamiliar wording from being
 * silently misread as "applies today".
 */
const FILLER = new Set([
  'y', 'e', 'o', 'a', 'al', 'de', 'del', 'la', 'el', 'los', 'las', 'cada',
  'mes', 'meses', 'semana', 'semanas', 'dia', 'dias', 'todos', 'todo',
  'primer', 'primero', 'primeros', 'primera', 'segundo', 'segunda', 'tercer',
  'tercera', 'cuarto', 'cuarta', 'ultimo', 'ultima', 'ultimos', 'ultimas',
]);

function dayOf(token: string): Weekday | null {
  if (token in DAY_NAMES) return DAY_NAMES[token]!;
  // "sábados", "jueves" — plurals, minding that "miercoles"/"viernes"/"jueves"
  // already end in s in the singular, hence the direct lookup above first.
  if (token.endsWith('s') && token.slice(0, -1) in DAY_NAMES) return DAY_NAMES[token.slice(0, -1)]!;
  return null;
}

// Spanish weeks run Monday-first, so ranges like "miércoles a domingos" only
// make sense against a Monday-based index.
const toWeekIdx = (d: Weekday) => (d + 6) % 7;
const fromWeekIdx = (i: number): Weekday => (((i + 1) % 7) as Weekday);

function addRange(into: Set<Weekday>, from: Weekday, to: Weekday) {
  const a = toWeekIdx(from);
  const b = toWeekIdx(to);
  const span = (b - a + 7) % 7;
  for (let i = 0; i <= span; i++) into.add(fromWeekIdx((a + i) % 7));
}

const daysInMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

export type DayVerdict =
  /** No day restriction at all — runs every day the promo is valid. */
  | 'always'
  /** Restricted to specific days, and today is one of them. */
  | 'today'
  /** Restricted to specific days, and today is not one of them. */
  | 'other-day'
  /** The phrasing wasn't fully understood; treat as "don't claim anything". */
  | 'unknown';

export function evaluateDays(raw: string | null | undefined, now: Date): DayVerdict {
  if (!raw || !raw.trim()) return 'always';
  const text = norm(raw);
  if (text.includes('todos los dias')) return 'always';

  const days = new Set<Weekday>();
  const numbers: number[] = [];
  let rangePending = false;
  let lastDay: Weekday | null = null;
  let understood = true;

  for (const token of text.split(/[^a-z0-9]+/).filter(Boolean)) {
    const day = dayOf(token);
    if (day != null) {
      if (rangePending && lastDay != null) addRange(days, lastDay, day);
      else days.add(day);
      lastDay = day;
      rangePending = false;
      continue;
    }
    if (/^\d+$/.test(token)) {
      numbers.push(Number(token));
      continue;
    }
    if (token === 'a' || token === 'al') {
      rangePending = true;
      continue;
    }
    if (!FILLER.has(token)) understood = false;
  }

  if (!understood) return 'unknown';

  // "del 1 al 10 de cada mes" — a day-of-month window rather than weekdays.
  const window = numbers.length >= 2 ? ([numbers[0]!, numbers[1]!] as const) : null;
  if (days.size === 0 && !window) return 'unknown';

  const dom = now.getDate();
  if (window && (dom < window[0] || dom > window[1])) return 'other-day';
  if (days.size > 0 && !days.has(now.getDay() as Weekday)) return 'other-day';

  // "jueves, viernes de la tercera semana del mes" — a week-of-month bucket.
  const weekOrdinal = /\bprimera semana\b/.test(text)
    ? 1
    : /\bsegunda semana\b/.test(text)
      ? 2
      : /\btercera semana\b/.test(text)
        ? 3
        : /\bcuarta semana\b/.test(text)
          ? 4
          : null;

  const occurrence = Math.floor((dom - 1) / 7) + 1;

  if (weekOrdinal != null) {
    if (occurrence !== weekOrdinal) return 'other-day';
  } else {
    // "primer y último jueves de cada mes" sets both, and matches either end.
    const wantsFirst = /\bprimer(o|os|a)?\b/.test(text);
    const wantsLast = /\bultim(o|os|a|as)\b/.test(text);
    if (wantsFirst || wantsLast) {
      const isLast = dom + 7 > daysInMonth(now);
      if (!((wantsFirst && occurrence === 1) || (wantsLast && isLast))) return 'other-day';
    }
  }

  return 'today';
}

/**
 * How many weekdays an offer runs on — the narrower, the more worth flagging.
 * "sábados y domingos" (every restaurant, every weekend) scores 2; "miércoles"
 * (Petrobras PREMMIA) scores 1 and outranks it. 7 for anything unrestricted.
 */
export function eligibleWeekdayCount(raw: string | null | undefined): number {
  if (!raw || !raw.trim()) return 7;
  const text = norm(raw);
  if (text.includes('todos los dias')) return 7;

  const days = new Set<Weekday>();
  let rangePending = false;
  let lastDay: Weekday | null = null;
  for (const token of text.split(/[^a-z0-9]+/).filter(Boolean)) {
    const day = dayOf(token);
    if (day != null) {
      if (rangePending && lastDay != null) addRange(days, lastDay, day);
      else days.add(day);
      lastDay = day;
      rangePending = false;
    } else if (token === 'a' || token === 'al') {
      rangePending = true;
    }
  }
  return days.size === 0 ? 7 : days.size;
}

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

/** Gas and pharmacies lead; everything else earns its slot by being narrow. */
const LEAD_CATEGORIES: ApiDiscountCategory[] = ['auto_fuel', 'beauty_health'];
const MAX_GROUPS = 4;

/**
 * The day-restricted offers that are live today, grouped into at most four
 * cards so Home stays readable. Offers with no day restriction are excluded on
 * purpose: they're true every day, so they aren't news.
 */
export function todaysOfferGroups(discounts: ApiDiscount[], now: Date): TodayOfferGroup[] {
  const live = discounts.filter(d => evaluateDays(d.eligibleDays, now) === 'today');

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
      narrowness: Math.min(...offers.map(o => eligibleWeekdayCount(o.eligibleDays))),
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
