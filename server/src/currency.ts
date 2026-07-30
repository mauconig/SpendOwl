/**
 * Display-currency handling, server side. **Nothing here converts.**
 *
 * The app used to render every amount through an invented EUR/USD/PYG rate
 * table. Those rates were demo values, so "converting" only added error and
 * implied an accuracy the app does not have. Changing base currency now changes
 * the symbol and the precision, nothing else. Real conversion needs live FX
 * rates and per-transaction currencies — §7 in .docs/BACKEND.md.
 *
 * All that remains is the minor-unit rule, which differs by currency:
 *
 *   EUR, USD   minor unit is the cent      -> stored 1240 is 12.40
 *   PYG        minor unit is the guaraní   -> stored 5000 is ₲5.000
 *
 * Guaraní has no subunit, so for PYG the stored integer *is* the amount. This
 * mirrors formatMoney() in src/theme.ts; the two must agree or the coach will
 * quote one number while the Dashboard draws another.
 */

import { queryOne } from './db.ts';

export type Currency = 'EUR' | 'USD' | 'PYG';

export const CURRENCIES: readonly Currency[] = ['EUR', 'USD', 'PYG'];

export function isCurrency(value: unknown): value is Currency {
  return typeof value === 'string' && (CURRENCIES as readonly string[]).includes(value);
}

/**
 * Read fresh per request rather than cached: the user can change it in Settings
 * at any moment, and both the coach and the daily insights bake the currency
 * into text they generate. The EUR fallback matches the column default.
 */
export async function getUserCurrency(userId: string): Promise<Currency> {
  const row = await queryOne<{ baseCurrency: string }>(
    `SELECT base_currency AS "baseCurrency" FROM users WHERE id = $1`,
    [userId]
  );
  return isCurrency(row?.baseCurrency) ? row.baseCurrency : 'EUR';
}

/** Guaraní amounts are whole numbers; euros and dollars get two places. */
export function decimalsFor(cur: Currency): 0 | 2 {
  return cur === 'PYG' ? 0 : 2;
}

/** Stored minor units -> the number a human reads in that currency. */
export function minorToDisplay(minor: number, cur: Currency): number {
  if (cur === 'PYG') return Math.round(minor);
  return Math.round(minor) / 100;
}

/** The number a human typed -> stored minor units. Inverse of minorToDisplay. */
export function displayToMinor(amount: number, cur: Currency): number {
  if (cur === 'PYG') return Math.round(amount);
  return Math.round(amount * 100);
}
