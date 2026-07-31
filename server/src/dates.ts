/**
 * Calendar dates, without a time zone anywhere near them.
 *
 * `Date#toISOString()` is the obvious way to get 'YYYY-MM-DD' out of a Date and
 * it is wrong here. A Date built from calendar parts — `new Date(2026, 6, 31)` —
 * is local midnight, and this server runs at UTC+2, so converting it to UTC
 * lands at 22:00 the *previous* day and the string reads 2026-07-30. Every
 * subscription charge came out dated a day early because of it.
 *
 * db.ts already documents the mirror image of this trap on the way back out of
 * Postgres (DATE columns parsed as local-midnight Dates shifting across the UTC
 * boundary). This is the same bug in the write direction, so the rule is the
 * same: a calendar day is year/month/day, and it never goes through UTC.
 */

/**
 * The one time zone the whole app reckons days in.
 *
 * There is no such thing as "today" without one, and this app had three at
 * once: Node ran on the VPS's Europe/Berlin, Postgres answered CURRENT_DATE in
 * UTC, and the user lives in Paraguay. For two hours every evening Node had
 * already rolled over to tomorrow while Postgres had not, so a subscription
 * charge could be written "today" by charges.ts and still be in the future
 * according to summary.ts — recorded, listed, and missing from the graph.
 *
 * It is pinned to the user's zone rather than the server's because the dates in
 * this app are the user's dates: a renewal on the 1st means the 1st where they
 * are. Deriving it from the host would make the app's behaviour depend on which
 * machine happens to run it.
 *
 * Postgres is put in the same zone in db.ts, which is what keeps CURRENT_DATE
 * and this in agreement.
 */
export const APP_TIME_ZONE = 'America/Asuncion';

// en-CA formats as 'YYYY-MM-DD', which is the shape every DATE column wants.
const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** 'YYYY-MM-DD' for an instant, as the calendar reads it in the app's zone. */
export function appDate(at: Date = new Date()): string {
  return dayFormat.format(at);
}

/**
 * Today as a Date at local midnight, carrying the app zone's calendar day.
 *
 * Deliberately not `new Date()`: that is the *server's* today, which is what
 * charged a subscription a day early. Callers compare it against other
 * local-midnight dates built from calendar parts, so the parts are what matter
 * and the wall-clock offset never enters the comparison.
 */
export function appToday(): Date {
  const [year, month, day] = appDate().split('-').map(Number);
  return new Date(year!, month! - 1, day!);
}

/** 'YYYY-MM-DD' from a Date's own local calendar fields. */
export function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 'YYYY-MM' — the key one subscription charge per calendar month is stored under. */
export function localPeriod(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
