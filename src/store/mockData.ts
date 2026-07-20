import { CatKey, PYG_PER_USD, formatPYG } from '../theme';

export type Msg =
  | { id: string; type: 'ai'; text: string }
  | { id: string; type: 'user'; text: string }
  | { id: string; type: 'voice'; dur: string }
  | { id: string; type: 'receipt' }
  | { id: string; type: 'scanning' }
  | { id: string; type: 'card'; merchant: string; cat: CatKey; eur: number; usd: number; pyg: number; note: string };

export function demoMsgs(): Msg[] {
  return [
    { id: 'a1', type: 'ai', text: "Morning, Maya. You're €38 under your usual pace this week — nice." },
    { id: 'u1', type: 'user', text: 'add my lunch — 12.40 at the market' },
    { id: 'c1', type: 'card', merchant: 'Mercado Central', cat: 'food', eur: 12.4, usd: 13.5, pyg: Math.round(13.5 * PYG_PER_USD), note: 'Lunch · logged from chat' },
  ];
}

export function firstMsgs(): Msg[] {
  return [
    {
      id: 'a0',
      type: 'ai',
      text: "Hi, I'm your SpendOwl coach. Snap a factura, send a voice note, or just type an expense — I'll handle the numbers.",
    },
  ];
}

export const REPLIES = [
  "Logged. You've got €1,283 safe to spend — want the food breakdown?",
  'Done. Anything else from today?',
  "On it. I'll nudge you if this pushes Food past its cap.",
];

export type Subscription = {
  id: string;
  name: string;
  color: string;
  price: number;
  day: string;
  muted: boolean;
  off: boolean;
};

export function subsSeed(): Subscription[] {
  return [
    { id: 'sp', name: 'Spotify', color: '#4ADE80', price: 10.99, day: '3rd', muted: false, off: false },
    { id: 'nf', name: 'Netflix', color: '#F0A878', price: 13.99, day: '12th', muted: false, off: false },
    { id: 'ic', name: 'iCloud+', color: '#78ADEE', price: 2.99, day: '18th', muted: true, off: false },
    { id: 'gym', name: 'Basic Fit', color: '#C9B8F5', price: 24.99, day: '25th', muted: false, off: false },
  ];
}

export type VaultItem = {
  id: string;
  merchant: string;
  date: string;
  amount: string;
  usd: string;
  pyg: string;
  status: 'ok' | 'warn';
  seed: number;
  cat: string;
};

export function vaultBaseSeed(firstRun: boolean): VaultItem[] {
  if (firstRun) return [];
  return [
    { id: 'v1', merchant: 'Mercado Central', date: 'Jul 14', amount: '€23.80', usd: '$25.90', pyg: formatPYG(25.9 * PYG_PER_USD), status: 'ok', seed: 0, cat: 'Food & Drink' },
    { id: 'v2', merchant: 'Uber', date: 'Jul 13', amount: '€11.20', usd: '$12.20', pyg: formatPYG(12.2 * PYG_PER_USD), status: 'ok', seed: 1, cat: 'Transport' },
    { id: 'v3', merchant: 'IKEA', date: 'Jul 12', amount: '€89.90', usd: '$97.90', pyg: formatPYG(97.9 * PYG_PER_USD), status: 'warn', seed: 2, cat: 'Shopping' },
    { id: 'v4', merchant: 'Farmacia Sol', date: 'Jul 10', amount: '€8.45', usd: '$9.20', pyg: formatPYG(9.2 * PYG_PER_USD), status: 'ok', seed: 0, cat: 'Health' },
    { id: 'v5', merchant: 'Taller Motor', date: 'Jul 8', amount: '€140.00', usd: '$152.50', pyg: formatPYG(152.5 * PYG_PER_USD), status: 'warn', seed: 1, cat: 'Transport' },
    { id: 'v6', merchant: 'Aldi', date: 'Jul 6', amount: '€54.60', usd: '$59.50', pyg: formatPYG(59.5 * PYG_PER_USD), status: 'ok', seed: 2, cat: 'Food & Drink' },
  ];
}

export type TxRow = { merchant: string; cat: CatKey; amt: number; date: string };

export const TX: TxRow[] = [
  { merchant: 'Mercado Central', cat: 'food', amt: -23.8, date: 'Today' },
  { merchant: 'Blue Bottle Coffee', cat: 'food', amt: -4.5, date: 'Today' },
  { merchant: 'Uber', cat: 'transport', amt: -11.2, date: 'Yesterday' },
  { merchant: 'Freelance invoice #114', cat: 'income', amt: 1850, date: 'Jul 15' },
  { merchant: 'IKEA', cat: 'shopping', amt: -89.9, date: 'Jul 14' },
  { merchant: 'Netflix', cat: 'bills', amt: -13.99, date: 'Jul 12' },
  { merchant: 'Basic Fit', cat: 'bills', amt: -24.99, date: 'Jul 10' },
];

export const AFFORD_OPTS = [
  { name: 'Headphones', v: 129 },
  { name: 'Monitor', v: 349 },
  { name: 'Laptop', v: 899 },
];

export const SAVINGS_TODAY = 2140;

// Cumulative spend for July 1 -> July 18 (today), used by the trend chart.
export const TREND_CUR = [0, 35, 80, 95, 160, 210, 240, 300, 340, 420, 470, 520, 600, 680, 760, 900, 1020, 1116];
