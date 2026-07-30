import type { CatKey } from '../theme';

// What's left of the old mockData.ts. The fixtures moved to the server's
// per-user seed (server/src/seed.ts); everything here is genuine client-side
// constant or view-model type, not stand-in data.

// 'scanning', 'thinking' and 'error' are client-only: transient states the UI
// renders while something is in flight, never rows in the messages table.
export type Msg =
  | { id: string; type: 'ai'; text: string }
  | { id: string; type: 'user'; text: string }
  | { id: string; type: 'voice'; dur: string }
  | { id: string; type: 'receipt' }
  | { id: string; type: 'scanning' }
  | { id: string; type: 'thinking' }
  | { id: string; type: 'error'; text: string }
  | { id: string; type: 'card'; merchant: string; cat: CatKey; amountEur: number; note: string };

export const AFFORD_OPTS = [
  { name: 'Headphones', v: 129 },
  { name: 'Monitor', v: 349 },
  { name: 'Laptop', v: 899 },
];

// Still a placeholder. The "Can I afford this?" sandbox needs a savings balance,
// and there is no savings/accounts table yet — that arrives with bank linking
// (.docs/BACKEND.md §2). Everything else on the Dashboard is now real.
export const SAVINGS_TODAY = 2140;

export const CARD_COLORS = ['#F0A878', '#78ADEE', '#C9B8F5', '#4ADE80'];

// View models: the API speaks integer cents, the UI speaks EUR. Mapping happens
// once in SpendOwlContext so screens keep the shapes they already render.
export type CreditCard = {
  id: string;
  name: string;
  last4: string;
  balance: number;
  limit: number;
  apr: number;
  color: string;
};

export type Subscription = {
  id: string;
  name: string;
  color: string;
  price: number;
  /** Ordinal for display, e.g. '3rd'. */
  day: string;
  dayOfMonth: number;
  muted: boolean;
  off: boolean;
};

export type VaultItem = {
  id: string;
  merchant: string;
  date: string;
  occurredAt: string;
  amountEur: number;
  status: 'ok' | 'warn';
  seed: number;
  cat: string;
};

/**
 * The receipt placeholder graphic comes in three variants. It used to be a
 * hand-assigned field on each fixture; derive it from the id so it stays
 * stable per receipt without being stored.
 */
export function paperSeed(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return hash % 3;
}
