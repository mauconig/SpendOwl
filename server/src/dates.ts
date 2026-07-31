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

/** 'YYYY-MM-DD' from a Date's own local calendar fields. */
export function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 'YYYY-MM' — the key one subscription charge per calendar month is stored under. */
export function localPeriod(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
