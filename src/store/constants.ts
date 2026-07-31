import type { CatKey, Currency } from '../theme';

// What's left of the old mockData.ts. The fixtures moved to the server's
// per-user seed (server/src/seed.ts); everything here is genuine client-side
// constant or view-model type, not stand-in data.

// 'scanning', 'thinking', 'transcribing' and 'error' are client-only: transient
// states the UI renders while something is in flight, never rows in the
// messages table.
export type Msg =
  | { id: string; type: 'ai'; text: string }
  | { id: string; type: 'user'; text: string }
  // `text` is the real transcript once the server has one — absent only for
  // rows recorded before voice notes were real, which have nothing to show.
  | { id: string; type: 'voice'; dur: string; text?: string }
  | { id: string; type: 'receipt' }
  | { id: string; type: 'scanning' }
  | { id: string; type: 'thinking' }
  | { id: string; type: 'transcribing' }
  | { id: string; type: 'error'; text: string }
  // One card message per thing the coach can propose. All five are drafts —
  // nothing is written until "Approve" is tapped, so the shape carries whatever
  // the approval will need (a resolved card or subscription id, a renewal day).
  | {
      id: string;
      type: 'card';
      action: 'expense';
      merchant: string;
      cat: CatKey;
      /** Already net of any bank discount below. */
      amountEur: number;
      note: string;
      cardId?: string;
      cardName?: string;
      // A promo the card's own bank was running for this merchant today,
      // found and applied server-side — see server/src/cardDiscounts.ts.
      discountBank?: string;
      discountPercent?: number;
      discountEur?: number;
    }
  // Money in. `amountEur` is positive, and stays positive through the write —
  // a positive transaction is what the server sums into income.
  | { id: string; type: 'card'; action: 'income'; source: string; amountEur: number; note: string }
  | { id: string; type: 'card'; action: 'card_payment'; cardId: string; cardName: string; amountEur: number }
  | { id: string; type: 'card'; action: 'sub_cancel'; subId: string; subName: string; amountEur: number }
  // amountEur here is in `subCurrency`, not the user's — a subscription is
  // billed in whatever currency the service charges in, and the app converts
  // it fresh every month rather than storing one frozen number.
  | {
      id: string;
      type: 'card';
      action: 'sub_add';
      subName: string;
      amountEur: number;
      dayOfMonth: number;
      subCurrency: Currency;
      cardId?: string;
      cardName?: string;
    }
  // Only the fields being changed are present; approving PATCHes exactly those.
  | {
      id: string;
      type: 'card';
      action: 'sub_edit';
      subId: string;
      subName: string;
      amountEur?: number;
      dayOfMonth?: number;
      subCurrency?: Currency;
      cardId?: string;
      cardName?: string;
    };

/**
 * Facturas (the receipt vault) are parked. The feature is built and the code is
 * all still here — this switches off the ways *in* to it, so nothing offers a
 * user something that isn't ready:
 *
 *   · the camera button in ChatScreen is hidden (it is the only way to file one)
 *   · HomeScreen drops its "facturas need review" card and sends any `vault`
 *     insight to the Dashboard instead
 *
 * The bottom-nav tab that used to hold the (never-shipped) factura vault now
 * shows OffersScreen instead — an unrelated, already-live feature. `InvoiceDetail`
 * and the receipts API are untouched and simply go unreached until this flips
 * back on, at which point the vault would need a nav slot of its own again.
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

// A curated palette, not a free color wheel — consistent with how every other
// color in this app is chosen by the app, never freely typed (see the
// icon-color note in HomeScreen.tsx). The first 4 match the app's other named
// accent colors (theme.ts CATS); the rest round out a 10-swatch picker.
export const CARD_COLORS = [
  '#F0A878', // peach
  '#78ADEE', // blue
  '#C9B8F5', // lavender
  '#4ADE80', // mint
  '#F87171', // rose
  '#FACC15', // amber
  '#E4E4E7', // silver
  '#5EEAD4', // teal
  '#A78BFA', // violet
  '#FB923C', // orange
];

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
  /**
   * In the user's base currency, converted server-side — this is the one to
   * total and compare. Null when no exchange rate was available.
   */
  price: number | null;
  /** What the service actually bills, in `currency`. Never converted. */
  nativePrice: number;
  currency: Currency;
  /** Ordinal for display, e.g. '3rd'. */
  day: string;
  dayOfMonth: number;
  muted: boolean;
  off: boolean;
  /** The card the monthly renewal is charged to, if any. */
  cardId: string | null;
  cardName: string | null;
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
