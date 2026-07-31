// The one recurring accent gradient in the v2 design — peach -> white -> blue.
export const GRAD = ['#F0A878', '#FBE3CE', '#FFFFFF', '#CADEF7', '#78ADEE'] as const;
export const GRAD_LOCATIONS = [0, 0.28, 0.5, 0.72, 1] as const;

export const colors = {
  bgTop: '#0A0A0C',
  bgBottom: '#050506',
  screenBg: '#050506',
  text: '#F5F5F7',
  textDim55: 'rgba(245,245,247,.55)',
  textDim50: 'rgba(245,245,247,.5)',
  textDim45: 'rgba(245,245,247,.45)',
  textDim40: 'rgba(245,245,247,.4)',
  textDim38: 'rgba(245,245,247,.38)',
  textDim35: 'rgba(245,245,247,.35)',
  textDim30: 'rgba(245,245,247,.3)',
  textDim70: 'rgba(245,245,247,.7)',
  textDim75: 'rgba(245,245,247,.75)',
  textDim65: 'rgba(245,245,247,.65)',
  textDim60: 'rgba(245,245,247,.6)',
  card: '#131316',
  cardBorder: 'rgba(255,255,255,.07)',
  hairline: 'rgba(255,255,255,.06)',
  bubbleAi: '#18181B',
  bubbleAiBorder: 'rgba(255,255,255,.06)',
  // v2 flips the user/voice bubble to a light chip with dark text.
  bubbleUser: '#F2F2F4',
  bubbleUserBorder: '#F2F2F4',
  bubbleUserText: '#101013',
  navBg: '#0A0A0C',
  navBorder: 'rgba(255,255,255,.06)',
  mint: '#4ADE80',
  mintDeep: '#22C55E',
  mintDark: '#0A0A0B',
  mintText: '#4ADE80',
  mintText2: '#BBF7D0',
  amber: '#FACC15',
  amberText: '#FDE68A',
  rose: '#F87171',
  sheet: '#111113',
  sheetBorder: 'rgba(255,255,255,.1)',
  bottomSheet: '#111113',
  cardAlt: '#18181B',
  input: '#141416',
  inputBorder: 'rgba(255,255,255,.09)',
  iconBg: '#1C1C1F',
};

// Presentation only: label and colour per category. Spend amounts used to live
// here too, which meant a theme file was the source of truth for money — and
// those numbers never agreed with the transaction list. Totals now come from
// GET /api/summary, computed from real rows.
export const CATS = {
  food: { name: 'Food & Drink', color: '#F0A878' },
  bills: { name: 'Bills & Subs', color: '#78ADEE' },
  shopping: { name: 'Shopping', color: '#C9B8F5' },
  transport: { name: 'Transport', color: '#E4E4E7' },
  income: { name: 'Income', color: '#4ADE80' },
  // Card payments land here too, not just interest — see DashboardScreen.
  debt: { name: 'Debt & interest', color: '#F87171' },
} as const;

export type CatKey = keyof typeof CATS;

export const fonts = {
  regular: 'Roboto_400Regular',
  medium: 'Roboto_500Medium',
  bold: 'Roboto_700Bold',
  mono: 'RobotoMono_400Regular',
  monoMedium: 'RobotoMono_500Medium',
};

// Roboto has no glyph for the Guaraní sign (U+20B2) — Noto Sans does, and
// its proportions sit close enough to Roboto's to swap in without clashing.
const notoFonts = {
  regular: 'NotoSans_400Regular',
  medium: 'NotoSans_500Medium',
  bold: 'NotoSans_700Bold',
  mono: 'NotoSansMono_400Regular',
};

export type Currency = 'EUR' | 'USD' | 'PYG';

// Paraguay conventionally uses "." as the thousands separator, and guaraní has
// no decimal subunit.
export function formatPYG(amount: number): string {
  return '₲' + Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Renders a stored amount in the user's currency. **This does not convert.**
 *
 * There used to be an EUR->USD->PYG rate table here, but the rates were
 * invented demo values, so "converting" only added error and implied an
 * accuracy the app does not have. Changing the base currency now changes the
 * symbol and the precision, nothing else. Real conversion needs live FX rates
 * and per-transaction currencies — that's §7 in .docs/BACKEND.md.
 *
 * `amount` arrives as the stored minor-unit value divided by 100 (see
 * minorToEur in src/api/types.ts). For EUR and USD that is already the major
 * unit. Guaraní has no subunit — its minor unit *is* the guaraní — so the
 * division is undone here rather than at all 20-odd call sites. That is why a
 * stored 5000 reads back as ₲5.000 and as €50.00.
 */
export function formatMoney(amount: number, cur: Currency, decimals: 0 | 2 = 2): string {
  if (cur === 'PYG') return formatPYG(amount * 100);
  const symbol = cur === 'EUR' ? '€' : '$';
  return symbol + amount.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Guaraní amounts are whole numbers; euros and dollars get two places. */
export function decimalsFor(cur: Currency): 0 | 2 {
  return cur === 'PYG' ? 0 : 2;
}

/**
 * Stored minor units <-> the number a human actually types and reads.
 *
 * formatMoney above is for *rendering* and takes the already-halved value that
 * minorToEur produces. These two are for **input**: they go straight between
 * the stored integer and the figure in a text field, with no /100 convention in
 * between. Someone on PYG typing 5000 means ₲5.000, which is stored as 5000;
 * someone on EUR typing 50 means €50.00, stored as 5000.
 *
 * These mirror server/src/currency.ts exactly. The two must agree, or an amount
 * edited on the phone comes back a hundred times too big.
 */
export function minorToDisplay(minor: number, cur: Currency): number {
  if (cur === 'PYG') return Math.round(minor);
  return Math.round(minor) / 100;
}

export function displayToMinor(amount: number, cur: Currency): number {
  if (cur === 'PYG') return Math.round(amount);
  return Math.round(amount * 100);
}

// Font family for a rendered money string — swaps to Noto Sans for PYG so
// the ₲ glyph actually exists, otherwise keeps the app's usual Roboto weight.
export function moneyFont(cur: Currency, weight: 'regular' | 'medium' | 'bold' | 'mono'): string {
  return cur === 'PYG' ? notoFonts[weight] : weight === 'mono' ? fonts.mono : fonts[weight];
}
