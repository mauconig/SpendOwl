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
  debt: { name: 'Card interest', color: '#F87171' },
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

// Approximate demo exchange rates. EUR_TO_USD matches the ratio already baked
// into the app's EUR/USD mock amounts (e.g. 12.40 EUR / 13.50 USD ≈ 1.089).
// Guaraní has no meaningful decimal unit, and Paraguay conventionally uses
// "." as the thousands separator.
export const EUR_TO_USD = 1.089;
export const PYG_PER_USD = 7500;
export const PYG_PER_EUR = EUR_TO_USD * PYG_PER_USD;

export function formatPYG(amount: number): string {
  return '₲' + Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function convertFromEUR(eur: number, cur: Currency): number {
  if (cur === 'EUR') return eur;
  if (cur === 'USD') return eur * EUR_TO_USD;
  return eur * PYG_PER_EUR;
}

// Formats an amount that's stored in EUR (dashboard/subscription mock data)
// into the given display currency. `decimals` controls EUR/USD precision —
// PYG is always shown as a whole number regardless.
export function formatMoney(eur: number, cur: Currency, decimals: 0 | 2 = 2): string {
  if (cur === 'PYG') return formatPYG(convertFromEUR(eur, cur));
  const symbol = cur === 'EUR' ? '€' : '$';
  return symbol + convertFromEUR(eur, cur).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// Font family for a rendered money string — swaps to Noto Sans for PYG so
// the ₲ glyph actually exists, otherwise keeps the app's usual Roboto weight.
export function moneyFont(cur: Currency, weight: 'regular' | 'medium' | 'bold' | 'mono'): string {
  return cur === 'PYG' ? notoFonts[weight] : weight === 'mono' ? fonts.mono : fonts[weight];
}
