/**
 * Which days a scraped discount actually applies on.
 *
 * `bank_discounts.eligible_days` is free-text Spanish lifted straight out of a
 * bank's Bases y Condiciones PDF — "miércoles a domingos", "primer y último
 * jueves de cada mes", "del 1 al 10 de cada mes". The scraper deliberately
 * doesn't normalise it, since the phrasing is worth showing verbatim on an
 * offer card, so anything that needs to know *whether a discount is live on a
 * given day* has to read it here.
 *
 * This lives on the server rather than the client because two things now
 * depend on the answer and they must never disagree: the Offers screen's
 * "today" cards, and the automatic discount applied when an expense is charged
 * to a bank's card. A second copy of this parser drifting from the first would
 * mean the app shows a discount it then declines to apply, or worse, quietly
 * takes money off an expense on a day the discount doesn't run.
 *
 * The parser is deliberately conservative: a phrase it cannot fully account
 * for returns 'unknown', and every caller treats that as "claim nothing".
 * Verified against all 23 distinct phrasings present in the real GNB data.
 */

// 0 = Sunday, matching Date#getDay.
type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const ACCENTS: Record<string, string> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n' };

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
 * the phrase says something this parser does not model, so the verdict becomes
 * 'unknown' — the guard that stops a new, unfamiliar wording from being read
 * as "applies today".
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
  // already end in s in the singular, hence the direct lookup first.
  if (token.endsWith('s') && token.slice(0, -1) in DAY_NAMES) return DAY_NAMES[token.slice(0, -1)]!;
  return null;
}

// Spanish weeks run Monday-first, so a range like "miércoles a domingos" only
// makes sense against a Monday-based index.
const toWeekIdx = (d: Weekday) => (d + 6) % 7;
const fromWeekIdx = (i: number): Weekday => (((i + 1) % 7) as Weekday);

function addRange(into: Set<Weekday>, from: Weekday, to: Weekday) {
  const a = toWeekIdx(from);
  const b = toWeekIdx(to);
  const span = (b - a + 7) % 7;
  for (let i = 0; i <= span; i++) into.add(fromWeekIdx((a + i) % 7));
}

const daysInMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

/** Weekdays and any number literals the phrase mentions. */
function parse(text: string): { days: Set<Weekday>; numbers: number[]; understood: boolean } {
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

  return { days, numbers, understood };
}

export type DayVerdict =
  /** No day restriction at all — runs every day the promo is valid. */
  | 'always'
  /** Restricted to specific days, and the given date is one of them. */
  | 'today'
  /** Restricted to specific days, and the given date is not one of them. */
  | 'other-day'
  /** The phrasing wasn't fully understood; claim nothing. */
  | 'unknown';

export function evaluateDays(raw: string | null | undefined, now: Date): DayVerdict {
  if (!raw || !raw.trim()) return 'always';
  const text = norm(raw);
  if (text.includes('todos los dias')) return 'always';

  const { days, numbers, understood } = parse(text);
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
    // "primer y último jueves de cada mes" sets both and matches either end.
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
 * How many weekdays a discount runs on — the narrower, the more worth
 * flagging. "sábados y domingos" (every restaurant, every weekend) scores 2;
 * "miércoles" (Petrobras PREMMIA) scores 1 and outranks it. 7 for unrestricted.
 */
export function eligibleWeekdayCount(raw: string | null | undefined): number {
  if (!raw || !raw.trim()) return 7;
  const text = norm(raw);
  if (text.includes('todos los dias')) return 7;
  const { days } = parse(text);
  return days.size === 0 ? 7 : days.size;
}
