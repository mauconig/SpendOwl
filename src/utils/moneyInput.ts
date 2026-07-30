import { decimalsFor, type Currency } from '../theme';

// Live thousands-grouping for whole-number amount inputs (no decimals) —
// dot separator, e.g. typing "150000" displays "150.000".

export function formatThousands(digits: string): string {
  const clean = digits.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  if (!clean) return '';
  return clean.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function parseThousands(display: string): number {
  const clean = display.replace(/\D/g, '');
  return clean ? Number(clean) : 0;
}

/**
 * The same idea, but currency-aware: guaraní has no subunit so it keeps the
 * whole-number grouping above, while euros and dollars need to accept "12.40".
 *
 * The value these produce is in **display** units — pair them with
 * displayToMinor/minorToDisplay in src/theme.ts, never with minorToEur, which
 * assumes the /100 rendering convention rather than what someone typed.
 */
export function formatAmountInput(raw: string, cur: Currency): string {
  if (decimalsFor(cur) === 0) return formatThousands(raw);
  const [whole = '', ...rest] = raw.replace(/[^\d.]/g, '').split('.');
  // Only the first '.' counts, and only two places after it.
  return rest.length > 0 ? `${whole}.${rest.join('').slice(0, 2)}` : whole;
}

export function parseAmountInput(display: string, cur: Currency): number {
  if (decimalsFor(cur) === 0) return parseThousands(display);
  const value = Number(display);
  return Number.isFinite(value) ? value : 0;
}
