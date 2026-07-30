// The API returns calendar days as plain 'YYYY-MM-DD' strings. Parsing those
// with `new Date(iso)` would treat them as UTC midnight and render as the
// previous day for anyone west of Greenwich, so build the date from its parts
// in local time instead.
export function parseDay(iso: string): Date {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'Jul 14' */
export function shortDate(iso: string): string {
  const date = parseDay(iso);
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

/** 'Jul 14, 2026' */
export function longDate(iso: string): string {
  return `${shortDate(iso)}, ${parseDay(iso).getFullYear()}`;
}

/** 'Today' / 'Yesterday' / 'Jul 14' — the labels the transaction list uses. */
export function relativeDayLabel(iso: string): string {
  const days = Math.round((startOfToday().getTime() - parseDay(iso).getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return shortDate(iso);
}

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** '2026-07' -> 'Jul' */
export function monthShort(monthKey: string): string {
  const index = Number(monthKey.slice(5, 7)) - 1;
  return MONTHS[index] ?? '';
}

/** '2026-07' -> 'July' */
export function monthLong(monthKey: string): string {
  const index = Number(monthKey.slice(5, 7)) - 1;
  return MONTHS_LONG[index] ?? '';
}

/** '2026-07' -> 'July 2026'. Month headings in the full transaction list. */
export function monthYearLong(monthKey: string): string {
  const name = monthLong(monthKey);
  return name ? `${name} ${monthKey.slice(0, 4)}` : '';
}

/** '2026-07-14' -> '2026-07'. The key transactions are grouped by. */
export function monthKeyOf(iso: string): string {
  return iso.slice(0, 7);
}

/** 3 -> '3rd'. Subscription rows show an ordinal day of month. */
export function ordinalDay(day: number): string {
  if (day % 100 >= 11 && day % 100 <= 13) return `${day}th`;
  const suffix = ['th', 'st', 'nd', 'rd'][day % 10] ?? 'th';
  return `${day}${suffix}`;
}
