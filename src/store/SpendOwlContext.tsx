import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  useAddCreditCard,
  useAddMessage,
  useAddReceipt,
  useAddTransaction,
  useApproveReceipt,
  useCreditCards,
  useDeleteMessage,
  useDeleteTransaction,
  useInsights,
  useMessages,
  useReceipts,
  useRefreshInsights,
  useRemoveCreditCard,
  useSendChat,
  useSubscriptions,
  useSummary,
  useTransactions,
  useUpdateSettings,
  useUpdateSubscription,
  useUpdateTransaction,
  useSettings,
} from '../api/hooks';
import { eurToMinor, minorToEur, type ApiInsight, type ApiSummary, type ApiTransaction } from '../api/types';
import { CatKey, Currency, displayToMinor } from '../theme';
import { ordinalDay, shortDate } from '../utils/date';
import {
  AFFORD_OPTS,
  CARD_COLORS,
  CreditCard,
  Msg,
  SAVINGS_TODAY,
  Subscription,
  VaultItem,
  paperSeed,
} from './constants';

export const GLOW = true;

export type { Currency };
type CardState = { tax: boolean; ok: boolean };
export type Nav = 'pager' | 'chat' | 'vault' | 'settings';

interface SpendOwlStore {
  // shell
  nav: Nav;
  page: 0 | 1;
  setNav: (n: Nav) => void;
  setPage: (p: 0 | 1) => void;
  toggleChat: () => void;
  goDash: () => void;
  bottomNavHeight: number;
  setBottomNavHeight: (h: number) => void;

  // load state — the app used to assume data was always present
  loading: boolean;
  error: string | null;
  retry: () => void;

  // chat
  messages: Msg[];
  input: string;
  setInput: (v: string) => void;
  attachment: boolean;
  attach: () => void;
  removeAttachment: () => void;
  recording: boolean;
  recSecs: number;
  startRec: () => void;
  endRec: (commit: boolean) => void;
  send: () => void;
  touched: boolean;
  firstRun: boolean;
  cardFor: (id: string) => CardState;
  setCard: (id: string, patch: Partial<CardState>) => void;
  rejectCard: (id: string) => void;

  // home — the model-written "For you today" cards. Empty is normal and safe:
  // HomeScreen falls back to its rule-based cards whenever it is.
  insights: ApiInsight[];

  // dashboard
  summary: ApiSummary | null;
  transactions: ApiTransaction[];
  overBudget: boolean;
  selCat: CatKey | null;
  setSelCat: (c: CatKey | null) => void;
  txOpen: boolean;
  openTx: () => void;
  closeTx: () => void;

  // Editing one transaction. `from` records which surface opened it, because
  // the two live at different depths: the Dashboard's list is on the page, but
  // the full history is itself a modal, and a modal can only reliably be
  // stacked on another by rendering inside it. See TransactionDetail.
  editTx: { id: string; from: 'dash' | 'sheet' } | null;
  openEditTx: (id: string, from: 'dash' | 'sheet') => void;
  closeEditTx: () => void;
  updateTransaction: (input: {
    id: string;
    merchant?: string;
    category?: CatKey;
    amountMinor?: number;
    occurredAt?: string;
    note?: string | null;
    taxDeductible?: boolean;
  }) => void;
  deleteTransaction: (id: string) => void;

  // credit cards
  creditCards: CreditCard[];
  addCardOpen: boolean;
  openAddCard: () => void;
  closeAddCard: () => void;
  addCreditCard: (input: { name: string; balance: number; limit: number; apr: number }) => void;
  removeCreditCard: (id: string) => void;
  payoffCardId: string | null;
  openPayoff: (id: string) => void;
  closePayoff: () => void;

  // afford modal
  affordOpen: boolean;
  affordSel: number;
  openAfford: () => void;
  closeAfford: () => void;
  setAffordSel: (i: number) => void;

  // subscriptions
  subs: Subscription[];
  subsOpen: boolean;
  openSubs: () => void;
  closeSubs: () => void;
  toggleSubMute: (id: string) => void;
  toggleSubOff: (id: string) => void;

  // vault / invoice detail
  vaultItems: VaultItem[];
  invOpen: string | null;
  openInvoice: (id: string) => void;
  closeInvoice: () => void;
  approveInvoice: () => void;
  scanFirst: () => void;

  // settings
  baseCur: Currency;
  setBaseCur: (c: Currency) => void;
  notif: boolean;
  toggleNotif: () => void;
  bio: boolean;
  toggleBio: () => void;
}

const SpendOwlCtx = createContext<SpendOwlStore | null>(null);

export function SpendOwlProvider({ children }: { children: React.ReactNode }) {
  // ---- UI-only state. Never persisted; resetting it on reload is correct. ----
  const [nav, setNav] = useState<Nav>('pager');
  const [page, setPage] = useState<0 | 1>(0);
  const [bottomNavHeight, setBottomNavHeight] = useState(0);
  const [input, setInput] = useState('');
  const [attachment, setAttachment] = useState(false);
  const [touched, setTouched] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const [cards, setCards] = useState<Record<string, CardState>>({});
  const [selCat, setSelCat] = useState<CatKey | null>(null);
  const [txOpen, setTxOpen] = useState(false);
  const [editTx, setEditTx] = useState<{ id: string; from: 'dash' | 'sheet' } | null>(null);
  const [addCardOpen, setAddCardOpen] = useState(false);
  const [payoffCardId, setPayoffCardId] = useState<string | null>(null);
  const [affordOpen, setAffordOpen] = useState(false);
  const [affordSel, setAffordSel] = useState(1);
  const [subsOpen, setSubsOpen] = useState(false);
  const [invOpen, setInvOpen] = useState<string | null>(null);
  // 'scanning' is a transient animation, never persisted — it lives here until
  // the (currently fake) scan resolves into a real card message.
  const [pendingScans, setPendingScans] = useState<string[]>([]);

  // ---- Server state ----
  const transactionsQuery = useTransactions();
  const summaryQuery = useSummary();
  const cardsQuery = useCreditCards();
  const subsQuery = useSubscriptions();
  const receiptsQuery = useReceipts();
  const messagesQuery = useMessages();
  const settingsQuery = useSettings();
  const insightsQuery = useInsights();

  const addTransaction = useAddTransaction();
  const updateTransactionMutation = useUpdateTransaction();
  const deleteTransactionMutation = useDeleteTransaction();
  const addCard = useAddCreditCard();
  const removeCard = useRemoveCreditCard();
  const updateSubscription = useUpdateSubscription();
  const approveReceipt = useApproveReceipt();
  const addReceipt = useAddReceipt();
  const addMessage = useAddMessage();
  const deleteMessage = useDeleteMessage();
  const sendChat = useSendChat();
  const updateSettings = useUpdateSettings();
  const refreshInsights = useRefreshInsights();

  // insightsQuery is deliberately absent: insights are an enhancement, not a
  // prerequisite. Including it here would let a slow or failed generation put
  // the whole app behind a spinner or an error screen, when the correct
  // behaviour is for Home to quietly show its rule-based cards instead.
  const queries = [transactionsQuery, summaryQuery, cardsQuery, subsQuery, receiptsQuery, messagesQuery, settingsQuery];
  const loading = queries.some(q => q.isLoading);
  const firstError = queries.find(q => q.error)?.error;
  const error = firstError instanceof Error ? firstError.message : null;

  const retry = useCallback(() => {
    queries.forEach(q => void q.refetch());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionsQuery.refetch, summaryQuery.refetch, cardsQuery.refetch, subsQuery.refetch, receiptsQuery.refetch, messagesQuery.refetch, settingsQuery.refetch]);

  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(
    () => () => {
      timersRef.current.forEach(clearTimeout);
      if (recTimerRef.current) clearInterval(recTimerRef.current);
    },
    []
  );

  const after = useCallback((ms: number, fn: () => void) => {
    timersRef.current.push(setTimeout(fn, ms));
  }, []);

  // ---- API -> view models ----
  const settings = settingsQuery.data;
  const baseCur: Currency = settings?.baseCurrency ?? 'EUR';

  /**
   * Today's insight cards are generated on the first Home load of the day. The
   * server owns the staleness rule — it covers both the date and the currency,
   * since the amounts are baked into the card text — so the client only reacts
   * to the flag.
   *
   * The ref records *what* was asked for rather than merely that something was,
   * which is what makes the two cases behave differently: a failed generation
   * is not retried on every render, but switching currency in Settings produces
   * a new key and does regenerate. This lives in the provider rather than in
   * HomeScreen so that navigating back to Home cannot re-trigger it.
   */
  const insightRequestRef = useRef<string | null>(null);
  useEffect(() => {
    if (!insightsQuery.data?.stale) return;
    const key = `${baseCur}:${new Date().toDateString()}`;
    if (insightRequestRef.current === key) return;
    insightRequestRef.current = key;
    refreshInsights.mutate();
  }, [insightsQuery.data?.stale, baseCur, refreshInsights.mutate]);

  const creditCards = useMemo<CreditCard[]>(
    () =>
      (cardsQuery.data ?? []).map(c => ({
        id: c.id,
        name: c.name,
        last4: c.last4,
        balance: minorToEur(c.balanceMinor),
        limit: minorToEur(c.limitMinor),
        apr: c.apr,
        color: c.color,
      })),
    [cardsQuery.data]
  );

  const subs = useMemo<Subscription[]>(
    () =>
      (subsQuery.data ?? []).map(s => ({
        id: s.id,
        name: s.name,
        color: s.color,
        price: minorToEur(s.priceMinor),
        day: ordinalDay(s.dayOfMonth),
        dayOfMonth: s.dayOfMonth,
        muted: s.muted,
        off: s.off,
      })),
    [subsQuery.data]
  );

  const vaultItems = useMemo<VaultItem[]>(
    () =>
      (receiptsQuery.data ?? []).map(r => ({
        id: r.id,
        merchant: r.merchant,
        date: shortDate(r.occurredAt),
        occurredAt: r.occurredAt,
        amountEur: Math.abs(minorToEur(r.amountMinor)),
        status: r.status,
        seed: paperSeed(r.id),
        cat: r.category,
      })),
    [receiptsQuery.data]
  );

  const serverMessages = useMemo<Msg[]>(
    () =>
      (messagesQuery.data ?? []).map((m): Msg => {
        switch (m.kind) {
          case 'user':
            return { id: m.id, type: 'user', text: m.payload.text ?? '' };
          case 'voice':
            return { id: m.id, type: 'voice', dur: m.payload.dur ?? '0:04' };
          case 'receipt':
            return { id: m.id, type: 'receipt' };
          case 'card':
            return {
              id: m.id,
              type: 'card',
              merchant: m.payload.merchant ?? 'Unknown',
              cat: m.payload.cat ?? 'food',
              amountEur: Math.abs(minorToEur(m.payload.amountMinor ?? 0)),
              note: m.payload.note ?? '',
            };
          default:
            return { id: m.id, type: 'ai', text: m.payload.text ?? '' };
        }
      }),
    [messagesQuery.data]
  );

  // A failed turn is surfaced but never persisted, so a network blip doesn't
  // leave an apology stuck in the transcript forever. It clears on next send.
  const chatError = sendChat.isError
    ? sendChat.error instanceof Error
      ? sendChat.error.message
      : 'Something went wrong.'
    : null;

  const messages = useMemo<Msg[]>(
    () => [
      ...serverMessages,
      ...pendingScans.map((id): Msg => ({ id, type: 'scanning' })),
      // isPending stays true through the messages refetch (see useSendChat), so
      // the indicator hands off directly to the rendered reply with no gap.
      ...(sendChat.isPending ? [{ id: 'thinking', type: 'thinking' } as Msg] : []),
      ...(chatError ? [{ id: 'chat-error', type: 'error', text: chatError } as Msg] : []),
    ],
    [serverMessages, pendingScans, sendChat.isPending, chatError]
  );

  // ---- Actions ----
  const cardFor = useCallback((id: string): CardState => cards[id] ?? { tax: false, ok: false }, [cards]);

  const setCard = useCallback(
    (id: string, patch: Partial<CardState>) => {
      setCards(prev => ({ ...prev, [id]: { ...(prev[id] ?? { tax: false, ok: false }), ...patch } }));

      // "Approve & log" now actually writes a transaction, rather than only
      // flipping a local flag.
      if (patch.ok) {
        const message = serverMessages.find(m => m.id === id);
        if (message?.type === 'card') {
          addTransaction.mutate({
            merchant: message.merchant,
            category: message.cat,
            amountMinor: -eurToMinor(message.amountEur),
            note: message.note,
            taxDeductible: cards[id]?.tax ?? false,
          });
        }
      }
    },
    [serverMessages, cards, addTransaction]
  );

  /**
   * Rejecting a draft deletes the message outright. A rejected card left in the
   * transcript is also left in the history replayed to the coach, which is
   * exactly the context that used to convince it a purchase was already handled.
   */
  const rejectCard = useCallback(
    (id: string) => {
      deleteMessage.mutate(id);
      setCards(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    },
    [deleteMessage]
  );

  const send = useCallback(() => {
    if (attachment) {
      const scanId = `scan-${Date.now()}`;
      setAttachment(false);
      setInput('');
      addMessage.mutate({ kind: 'receipt', payload: {} });
      setPendingScans(prev => [...prev, scanId]);

      // Fake scan: fixed delay, fixed result. Real OCR is the next slice.
      after(2600, () => {
        setPendingScans(prev => prev.filter(id => id !== scanId));
        addMessage.mutate({
          kind: 'card',
          payload: {
            merchant: 'Mercado Central',
            cat: 'food',
            amountMinor: -2380,
            note: '3 items · Groceries · scanned',
          },
        });
        addReceipt.mutate({
          merchant: 'Mercado Central',
          amountMinor: -2380,
          category: 'Food & Drink',
          status: 'ok',
        });
      });
      return;
    }

    const text = input.trim();
    if (!text) return;
    setInput('');
    // One call runs the whole turn server-side — it persists this message, asks
    // the coach, and persists the reply. The user's bubble appears immediately
    // via the optimistic update inside useSendChat.
    sendChat.mutate(text);
  }, [attachment, input, addMessage, addReceipt, after, sendChat]);

  const startRec = useCallback(() => {
    setRecording(true);
    setRecSecs(0);
    recTimerRef.current = setInterval(() => setRecSecs(s => s + 1), 1000);
  }, []);

  const endRec = useCallback(
    (commit: boolean) => {
      if (recTimerRef.current) clearInterval(recTimerRef.current);
      setRecording(false);
      setRecSecs(secsNow => {
        const secs = Math.max(secsNow, 4);
        if (commit) {
          addMessage.mutate({ kind: 'voice', payload: { dur: `0:${String(secs).padStart(2, '0')}` } });
          after(1400, () =>
            addMessage.mutate({
              kind: 'card',
              payload: {
                merchant: 'Blue Bottle Coffee',
                cat: 'food',
                amountMinor: -450,
                note: 'Voice note · transcribed',
              },
            })
          );
        }
        return 0;
      });
    },
    [addMessage, after]
  );

  const attach = useCallback(() => {
    setAttachment(true);
    setTouched(true);
  }, []);

  const openInvoice = useCallback((id: string) => setInvOpen(id), []);
  const closeInvoice = useCallback(() => setInvOpen(null), []);
  const approveInvoice = useCallback(() => {
    if (invOpen) approveReceipt.mutate(invOpen);
  }, [invOpen, approveReceipt]);

  const scanFirst = useCallback(() => {
    setNav('chat');
    setAttachment(true);
    setTouched(true);
  }, []);

  const toggleChat = useCallback(() => setNav(prev => (prev === 'chat' ? 'pager' : 'chat')), []);
  const goDash = useCallback(() => {
    setNav('pager');
    setPage(1);
  }, []);

  const toggleSubMute = useCallback(
    (id: string) => {
      const sub = subs.find(s => s.id === id);
      if (sub) updateSubscription.mutate({ id, muted: !sub.muted });
    },
    [subs, updateSubscription]
  );

  const toggleSubOff = useCallback(
    (id: string) => {
      const sub = subs.find(s => s.id === id);
      if (sub) updateSubscription.mutate({ id, off: !sub.off });
    },
    [subs, updateSubscription]
  );

  const addCreditCard = useCallback(
    (input: { name: string; balance: number; limit: number; apr: number }) => {
      addCard.mutate({
        name: input.name,
        // displayToMinor, not eurToMinor: these come from a text field, and
        // eurToMinor always multiplies by 100. On a guaraní account that turned
        // a typed 150.000 into a stored 15.000.000 — the card read back a
        // hundred times too big. eurToMinor is right where the value has
        // already been through minorToEur (the card-approval path); it is wrong
        // for anything a person typed.
        balanceMinor: displayToMinor(input.balance, baseCur),
        limitMinor: displayToMinor(input.limit, baseCur),
        apr: input.apr,
        color: CARD_COLORS[creditCards.length % CARD_COLORS.length]!,
      });
    },
    [addCard, creditCards.length, baseCur]
  );

  const summary = summaryQuery.data ?? null;

  const value: SpendOwlStore = {
    nav,
    page,
    setNav,
    setPage,
    toggleChat,
    goDash,
    bottomNavHeight,
    setBottomNavHeight,

    loading,
    error,
    retry,

    messages,
    input,
    setInput,
    attachment,
    attach,
    removeAttachment: () => setAttachment(false),
    recording,
    recSecs,
    startRec,
    endRec,
    send,
    touched,
    firstRun: !loading && serverMessages.length === 0,
    cardFor,
    setCard,
    rejectCard,

    insights: insightsQuery.data?.insights ?? [],

    summary,
    transactions: transactionsQuery.data ?? [],
    overBudget: summary?.overBudget ?? false,
    selCat,
    setSelCat,
    txOpen,
    openTx: () => setTxOpen(true),
    closeTx: () => setTxOpen(false),

    editTx,
    openEditTx: (id: string, from: 'dash' | 'sheet') => setEditTx({ id, from }),
    closeEditTx: () => setEditTx(null),
    updateTransaction: input => updateTransactionMutation.mutate(input),
    deleteTransaction: (id: string) => deleteTransactionMutation.mutate(id),

    creditCards,
    addCardOpen,
    openAddCard: () => setAddCardOpen(true),
    closeAddCard: () => setAddCardOpen(false),
    addCreditCard,
    removeCreditCard: (id: string) => removeCard.mutate(id),
    payoffCardId,
    openPayoff: (id: string) => setPayoffCardId(id),
    closePayoff: () => setPayoffCardId(null),

    affordOpen,
    affordSel,
    openAfford: () => setAffordOpen(true),
    closeAfford: () => setAffordOpen(false),
    setAffordSel,

    subs,
    subsOpen,
    openSubs: () => setSubsOpen(true),
    closeSubs: () => setSubsOpen(false),
    toggleSubMute,
    toggleSubOff,

    vaultItems,
    invOpen,
    openInvoice,
    closeInvoice,
    approveInvoice,
    scanFirst,

    baseCur,
    setBaseCur: (c: Currency) => updateSettings.mutate({ baseCurrency: c }),
    notif: settings?.notif ?? true,
    toggleNotif: () => updateSettings.mutate({ notif: !(settings?.notif ?? true) }),
    bio: settings?.bio ?? false,
    toggleBio: () => updateSettings.mutate({ bio: !(settings?.bio ?? false) }),
  };

  return <SpendOwlCtx.Provider value={value}>{children}</SpendOwlCtx.Provider>;
}

export function useSpendOwl() {
  const ctx = useContext(SpendOwlCtx);
  if (!ctx) throw new Error('useSpendOwl must be used within SpendOwlProvider');
  return ctx;
}

export { AFFORD_OPTS, SAVINGS_TODAY };
