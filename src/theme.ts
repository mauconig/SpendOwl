export const colors = {
  bgTop: '#141821',
  bgBottom: '#07080b',
  screenBg: '#0B0D11',
  text: '#E9EDF2',
  textDim55: 'rgba(233,237,242,.55)',
  textDim50: 'rgba(233,237,242,.5)',
  textDim45: 'rgba(233,237,242,.45)',
  textDim40: 'rgba(233,237,242,.4)',
  textDim38: 'rgba(233,237,242,.38)',
  textDim35: 'rgba(233,237,242,.35)',
  textDim30: 'rgba(233,237,242,.3)',
  textDim70: 'rgba(233,237,242,.7)',
  textDim75: 'rgba(233,237,242,.75)',
  textDim65: 'rgba(233,237,242,.65)',
  textDim60: 'rgba(233,237,242,.6)',
  card: '#12151B',
  cardBorder: 'rgba(255,255,255,.05)',
  hairline: 'rgba(255,255,255,.06)',
  bubbleAi: '#171B22',
  bubbleAiBorder: 'rgba(255,255,255,.06)',
  bubbleUser: 'rgba(77,240,184,.13)',
  bubbleUserBorder: 'rgba(77,240,184,.22)',
  navBg: '#0E1116',
  navBorder: 'rgba(255,255,255,.06)',
  mint: '#4DF0B8',
  mintDeep: '#2ECF96',
  mintDark: '#06231A',
  mintText: '#7BF7CC',
  mintText2: '#BFF7E2',
  violet: '#9D8CFF',
  violetLight: '#C9BEFF',
  violetText: '#DCD4FF',
  amber: '#FFC46B',
  amberText: '#FFD79A',
  rose: '#FF8FA3',
  sheet: '#14171F',
  sheetBorder: 'rgba(157,140,255,.3)',
  bottomSheet: '#12151C',
  cardAlt: '#171B23',
  input: '#161A21',
  inputBorder: 'rgba(255,255,255,.09)',
  iconBg: '#232936',
};

export const CATS = {
  food: { name: 'Food & Drink', color: '#9D8CFF', amount: 412.3 },
  bills: { name: 'Bills & Subs', color: '#FFC46B', amount: 318.75 },
  shopping: { name: 'Shopping', color: '#FF8FB8', amount: 236.4 },
  transport: { name: 'Transport', color: '#6FB6FF', amount: 148.9 },
  income: { name: 'Income', color: '#4DF0B8', amount: 0 },
} as const;

export type CatKey = keyof typeof CATS;

export const fonts = {
  regular: 'Roboto_400Regular',
  medium: 'Roboto_500Medium',
  bold: 'Roboto_700Bold',
  mono: 'RobotoMono_400Regular',
  monoMedium: 'RobotoMono_500Medium',
};

// Approximate demo exchange rate — Guaraní has no meaningful decimal unit,
// and Paraguay conventionally uses "." as the thousands separator.
export const PYG_PER_USD = 7500;

export function formatPYG(amount: number): string {
  return '₲' + Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
