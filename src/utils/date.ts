import { getLanguage, t, type Language } from '../i18n';

// The API returns calendar days as plain 'YYYY-MM-DD' strings. Parsing those
// with `new Date(iso)` would treat them as UTC midnight and render as the
// previous day for anyone west of Greenwich, so build the date from its parts
// in local time instead.
export function parseDay(iso: string): Date {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

/**
 * The inverse of parseDay: a Date back to 'YYYY-MM-DD'. Built from the local
 * fields for the same reason parseDay reads them — `toISOString()` converts to
 * UTC first, so picking the 30th anywhere west of Greenwich would save the 29th.
 */
export function toDayString(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

const MONTHS: Record<Language, string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
};

/**
 * 'Jul 14' / '14 de jul'
 *
 * Not a dictionary lookup like the rest of the UI: the two languages put the
 * day and month in opposite orders, so translating the month name alone would
 * produce "jul 14", which no Spanish speaker writes.
 */
export function shortDate(iso: string): string {
  const date = parseDay(iso);
  const month = MONTHS[getLanguage()][date.getMonth()];
  return getLanguage() === 'es' ? `${date.getDate()} de ${month}` : `${month} ${date.getDate()}`;
}

/** 'Jul 14, 2026' / '14 de jul de 2026' */
export function longDate(iso: string): string {
  const year = parseDay(iso).getFullYear();
  return getLanguage() === 'es' ? `${shortDate(iso)} de ${year}` : `${shortDate(iso)}, ${year}`;
}

/** 'Today' / 'Yesterday' / 'Jul 14' — the labels the transaction list uses. */
export function relativeDayLabel(iso: string): string {
  const days = Math.round((startOfToday().getTime() - parseDay(iso).getTime()) / 86_400_000);
  if (days === 0) return t('Today');
  if (days === 1) return t('Yesterday');
  return shortDate(iso);
}

const MONTHS_LONG: Record<Language, string[]> = {
  en: ['January', 'February', 'March', 'April', 'May', 'June',
       'July', 'August', 'September', 'October', 'November', 'December'],
  // Lower case on purpose: Spanish does not capitalise month names, and a
  // capitalised one reads as a translated-from-English app.
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
       'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
};

/** '2026-07' -> 'Jul' */
export function monthShort(monthKey: string): string {
  const index = Number(monthKey.slice(5, 7)) - 1;
  return MONTHS[getLanguage()][index] ?? '';
}

/** '2026-07' -> 'July' */
export function monthLong(monthKey: string): string {
  const index = Number(monthKey.slice(5, 7)) - 1;
  return MONTHS_LONG[getLanguage()][index] ?? '';
}

/** '2026-07' -> 'July 2026'. Month headings in the full transaction list. */
export function monthYearLong(monthKey: string): string {
  const name = monthLong(monthKey);
  if (!name) return '';
  // "julio de 2026", not "julio 2026" — the preposition is not optional here.
  return getLanguage() === 'es' ? `${name} de ${monthKey.slice(0, 4)}` : `${name} ${monthKey.slice(0, 4)}`;
}

/** '2026-07-14' -> '2026-07'. The key transactions are grouped by. */
export function monthKeyOf(iso: string): string {
  return iso.slice(0, 7);
}

/**
 * 3 -> '3rd' / '3'. Subscription rows show an ordinal day of month.
 *
 * Spanish has no everyday written ordinal for a date — a renewal on the 3rd is
 * "el 3", not "el 3.º" — so the number stands alone rather than being decorated
 * with a suffix nobody writes.
 */
export function ordinalDay(day: number): string {
  if (getLanguage() === 'es') return String(day);
  if (day % 100 >= 11 && day % 100 <= 13) return `${day}th`;
  const suffix = ['th', 'st', 'nd', 'rd'][day % 10] ?? 'th';
  return `${day}${suffix}`;
}
