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
  // One card message per thing the coach can propose. All four are drafts —
  // nothing is written until "Approve" is tapped, so the shape carries whatever
  // the approval will need (a resolved card or subscription id, a renewal day).
  | {
      id: string;
      type: 'card';
      action: 'expense';
      merchant: string;
      cat: CatKey;
      amountEur: number;
      note: string;
      cardId?: string;
      cardName?: string;
    }
  | { id: string; type: 'card'; action: 'card_payment'; cardId: string; cardName: string; amountEur: number }
  | { id: string; type: 'card'; action: 'sub_cancel'; subId: string; subName: string; amountEur: number }
  | { id: string; type: 'card'; action: 'sub_add'; subName: string; amountEur: number; dayOfMonth: number };

/**
 * Facturas (the receipt vault) are parked. The feature is built and the code is
 * all still here — this switches off the ways *in* to it, so nothing offers a
 * user something that isn't ready:
 *
 *   · VaultScreen renders a "coming soon" panel instead of the grid
 *   · the camera button in ChatScreen is hidden (it is the only way to file one)
 *   · HomeScreen drops its "facturas need review" card and sends any `vault`
 *     insight to the Dashboard instead
 *
 * The bottom-nav tab deliberately stays, so the screen is still reachable and
 * says what's coming. `InvoiceDetail` and the receipts API are untouched and
 * simply go unreached.
 *
 * There is a matching FACTURAS_ENABLED in server/src/insights.ts — the two
 * codebases share no module, so flipping this back on means flipping both.
 */
// Annotated `boolean` rather than inferred as the literal `false`, so that
// flipping it back is a one-character edit and not a cascade of "this condition
// is always false" narrowing errors.
export const FACTURAS_ENABLED: boolean = false;

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
  last4: string | null;
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
