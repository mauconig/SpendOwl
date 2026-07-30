import type { CatKey, Currency } from '../theme';

// Wire shapes returned by the API. Money is always integer minor units (EUR
// cents) — convert with minorToEur() at the render boundary, never before.

export type ApiTransaction = {
  id: string;
  merchant: string;
  category: CatKey;
  /** Signed cents: negative is spend, positive is income. */
  amountMinor: number;
  occurredAt: string;
  note: string | null;
  taxDeductible: boolean;
};

export type ApiCategoryTotal = { key: CatKey; spentMinor: number };
export type ApiTrendPoint = { day: string; cumulativeMinor: number };

export type ApiSummary = {
  month: string;
  budgetMinor: number;
  spentMinor: number;
  incomeMinor: number;
  safeToSpendMinor: number;
  overBudget: boolean;
  percentOfBudget: number;
  daysLeft: number;
  daysInMonth: number;
  /** Positive means under pace for the month so far. */
  paceDeltaMinor: number;
  pacePercent: number;
  categories: ApiCategoryTotal[];
  trend: ApiTrendPoint[];
};

export type ApiCreditCard = {
  id: string;
  name: string;
  /** Null for cards added in-app — the field is no longer asked for. */
  last4: string | null;
  balanceMinor: number;
  limitMinor: number;
  apr: number;
  color: string;
};

export type ApiSubscription = {
  id: string;
  name: string;
  color: string;
  priceMinor: number;
  dayOfMonth: number;
  muted: boolean;
  off: boolean;
};

export type ApiReceipt = {
  id: string;
  merchant: string;
  amountMinor: number;
  occurredAt: string;
  status: 'ok' | 'warn';
  category: string;
};

export type ApiMessageKind = 'ai' | 'user' | 'voice' | 'receipt' | 'card';

export type ApiMessage = {
  id: string;
  kind: ApiMessageKind;
  payload: {
    text?: string;
    dur?: string;
    merchant?: string;
    cat?: CatKey;
    amountMinor?: number;
    note?: string;
  };
  createdAt: string;
};

/**
 * A "For you today" card, written by the model once a day (see
 * server/src/insights.ts). Unlike every other shape here it carries *rendered
 * prose* — the amounts are already formatted into `title` and `body`, in the
 * currency the card was generated for — so nothing on this type goes through
 * minorToEur() or formatMoney().
 */
export type ApiInsightIcon = 'trendUp' | 'trendDown' | 'pie' | 'bars' | 'warn' | 'spark' | 'card';
export type ApiInsightAction = 'chat' | 'dashboard' | 'subscriptions' | 'vault';

export type ApiInsight = {
  title: string;
  body: string;
  cta: string;
  icon: ApiInsightIcon;
  /** Where tapping the card goes. A card cannot carry a closure. */
  action: ApiInsightAction;
  /** Receipt id for a `vault` card to deep-link to. Server-validated. */
  targetId: string | null;
};

export type ApiInsights = {
  generatedOn: string | null;
  currency: Currency | null;
  /** True when the client should ask for a regeneration. */
  stale: boolean;
  insights: ApiInsight[];
};

export type ApiSettings = {
  baseCurrency: Currency;
  monthlyBudgetMinor: number;
  notif: boolean;
  bio: boolean;
};

/** Cents -> EUR. The one place the minor-units convention is unwound. */
export function minorToEur(minor: number): number {
  return minor / 100;
}

/** EUR -> cents, rounded. Guards against float drift on user input. */
export function eurToMinor(eur: number): number {
  return Math.round(eur * 100);
}
