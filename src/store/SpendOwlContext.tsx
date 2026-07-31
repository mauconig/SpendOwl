import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  useAddCreditCard,
  useAddMessage,
  useAddSubscription,
  useAddReceipt,
  useAddTransaction,
  useApproveReceipt,
  useChargeCreditCard,
  useCreditCards,
  useDeleteMessage,
  useDeleteTransaction,
  useInsights,
  useMessages,
  usePayoffCreditCard,
  useReceipts,
  useRefreshInsights,
  useRemoveCreditCard,
  useSendChat,
  useSendVoice,
  useSubscriptions,
  useSummary,
  useTransactions,
  useUpdateCreditCard,
  useUpdateSettings,
  useUpdateSubscription,
  useUpdateTransaction,
  useSettings,
} from '../api/hooks';
import {
  eurToMinor,
  minorToEur,
  type ApiDiscountCategory,
  type ApiInsight,
  type ApiSummary,
  type ApiTransaction,
} from '../api/types';
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
  startRec: () => Promise<void>;
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
  // One sheet, two modes: `{ mode: 'add' }` mirrors the old addCardOpen
  // boolean, `{ mode: 'edit', id }` opens the same form pre-filled — there
  // was no edit flow at all before this, so it's built as the add form's
  // second mode rather than a separate screen.
  cardSheet: { mode: 'add' } | { mode: 'edit'; id: string } | null;
  openAddCard: () => void;
  openEditCard: (id: string) => void;
  closeCardSheet: () => void;
  addCreditCard: (input: { name: string; balance: number; limit: number; apr: number; color?: string }) => void;
  updateCreditCard: (input: {
    id: string;
    name?: string;
    balance?: number;
    limit?: number;
    apr?: number;
    color?: string;
  }) => void;
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
  // Editing one subscription's terms. Mirrors `cardSheet` above, minus the add
  // mode — subscriptions are still only created through the chat coach.
  subSheet: { id: string } | null;
  openEditSub: (id: string) => void;
  closeSubSheet: () => void;
  updateSubscriptionDetails: (input: {
    id: string;
    name?: string;
    /** As typed, in `currency` — not minor units. */
    price?: number;
    currency?: Currency;
    dayOfMonth?: number;
    cardId?: string | null;
  }) => void;

  // today's card discounts, grouped by category on Home. Only the selected
  // category lives here — the offers themselves come from useDiscounts(), which
  // is cached, so the sheet reads them directly rather than duplicating them.
  todayOffersCat: ApiDiscountCategory | null;
  openTodayOffers: (c: ApiDiscountCategory) => void;
  closeTodayOffers: () => void;

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
  // Surfaced as a transient error bubble, same treatment as a failed chat/voice
  // turn — cleared the moment another recording attempt starts.
  const [micError, setMicError] = useState<string | null>(null);
  const [cards, setCards] = useState<Record<string, CardState>>({});
  const [selCat, setSelCat] = useState<CatKey | null>(null);
  const [txOpen, setTxOpen] = useState(false);
  const [editTx, setEditTx] = useState<{ id: string; from: 'dash' | 'sheet' } | null>(null);
  const [cardSheet, setCardSheet] = useState<{ mode: 'add' } | { mode: 'edit'; id: string } | null>(null);
  const [payoffCardId, setPayoffCardId] = useState<string | null>(null);
  const [affordOpen, setAffordOpen] = useState(false);
  const [affordSel, setAffordSel] = useState(1);
  const [subsOpen, setSubsOpen] = useState(false);
  const [subSheet, setSubSheet] = useState<{ id: string } | null>(null);
  const [invOpen, setInvOpen] = useState<string | null>(null);
  const [todayOffersCat, setTodayOffersCat] = useState<ApiDiscountCategory | null>(null);
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
  const updateCard = useUpdateCreditCard();
  const removeCard = useRemoveCreditCard();
  const chargeCard = useChargeCreditCard();
  const payoffCard = usePayoffCreditCard();
  const addSubscription = useAddSubscription();
  const updateSubscription = useUpdateSubscription();
  const approveReceipt = useApproveReceipt();
  const addReceipt = useAddReceipt();
  const addMessage = useAddMessage();
  const deleteMessage = useDeleteMessage();
  const sendChat = useSendChat();
  const sendVoice = useSendVoice();
  const updateSettings = useUpdateSettings();
  const refreshInsights = useRefreshInsights();

  // The recorder instance lives for the lifetime of the provider — a fresh one
  // per recording would mean re-requesting permission and re-preparing every
  // time. `useAudioRecorderState` polls it (default interval) so `recording`
  // and `recSecs` below are always the recorder's own account of itself,
  // never a manually-ticked timer that can drift from what was actually
  // captured.
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);

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

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

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
        // Two prices, deliberately: what the service bills (in its own
        // currency, fixed) and what that comes to in the user's (converted
        // server-side at today's rate, so it moves month to month).
        price: s.priceBaseMinor == null ? null : minorToEur(s.priceBaseMinor),
        nativePrice: minorToEur(s.priceMinor),
        currency: s.currency,
        day: ordinalDay(s.dayOfMonth),
        dayOfMonth: s.dayOfMonth,
        muted: s.muted,
        off: s.off,
        cardId: s.cardId,
        cardName: s.cardName,
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
            return { id: m.id, type: 'voice', dur: m.payload.dur ?? '0:04', text: m.payload.text };
          case 'receipt':
            return { id: m.id, type: 'receipt' };
          case 'card': {
            const p = m.payload;
            const amountEur = Math.abs(minorToEur(p.amountMinor ?? 0));
            // A missing action means a row written before card payments and
            // subscriptions existed, all of which were expenses.
            switch (p.action) {
              case 'income':
                return {
                  id: m.id,
                  type: 'card',
                  action: 'income',
                  source: p.source ?? 'Income',
                  amountEur,
                  note: p.note ?? '',
                };
              case 'card_payment':
                return {
                  id: m.id,
                  type: 'card',
                  action: 'card_payment',
                  cardId: p.cardId ?? '',
                  cardName: p.cardName ?? 'your card',
                  amountEur,
                };
              case 'sub_cancel':
                return {
                  id: m.id,
                  type: 'card',
                  action: 'sub_cancel',
                  subId: p.subId ?? '',
                  subName: p.subName ?? 'that subscription',
                  amountEur,
                };
              case 'sub_add':
                return {
                  id: m.id,
                  type: 'card',
                  action: 'sub_add',
                  subName: p.subName ?? 'New subscription',
                  amountEur,
                  dayOfMonth: p.dayOfMonth ?? 1,
                  // Rows written before subscriptions had a currency of their
                  // own were all in the user's, which is what baseCur is.
                  subCurrency: p.subCurrency ?? baseCur,
                  cardId: p.cardId,
                  cardName: p.cardName,
                };

              case 'sub_edit':
                return {
                  id: m.id,
                  type: 'card',
                  action: 'sub_edit',
                  subId: p.subId ?? '',
                  subName: p.subName ?? 'that subscription',
                  // Absent fields mean "leave this alone", so they must stay
                  // undefined rather than defaulting to something.
                  amountEur: p.amountMinor == null ? undefined : amountEur,
                  dayOfMonth: p.dayOfMonth,
                  subCurrency: p.subCurrency,
                  cardId: p.cardId,
                  cardName: p.cardName,
                };
              default:
                return {
                  id: m.id,
                  type: 'card',
                  action: 'expense',
                  merchant: p.merchant ?? 'Unknown',
                  cat: p.cat ?? 'food',
                  amountEur,
                  note: p.note ?? '',
                  cardId: p.cardId,
                  cardName: p.cardName,
                  discountBank: p.discountBank,
                  discountPercent: p.discountPercent,
                  discountEur: p.discountMinor == null ? undefined : minorToEur(p.discountMinor),
                };
            }
          }
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

  // Same idea for a voice note: a bad upload, a 502 from the transcriber, or
  // the 422 the server returns for a recording it couldn't make anything of
  // (silence, static) all surface here rather than becoming a permanent,
  // reply-less voice bubble.
  const voiceError = sendVoice.isError
    ? sendVoice.error instanceof Error
      ? sendVoice.error.message
      : 'Something went wrong.'
    : micError;

  const messages = useMemo<Msg[]>(
    () => [
      ...serverMessages,
      ...pendingScans.map((id): Msg => ({ id, type: 'scanning' })),
      // isPending stays true through the messages refetch (see useSendChat), so
      // the indicator hands off directly to the rendered reply with no gap.
      ...(sendChat.isPending ? [{ id: 'thinking', type: 'thinking' } as Msg] : []),
      // Covers transcription *and* the coach turn that follows it — both run
      // server-side in one request, so there is only the one state to show.
      ...(sendVoice.isPending ? [{ id: 'transcribing', type: 'transcribing' } as Msg] : []),
      ...(chatError ? [{ id: 'chat-error', type: 'error', text: chatError } as Msg] : []),
      ...(voiceError ? [{ id: 'voice-error', type: 'error', text: voiceError } as Msg] : []),
    ],
    [serverMessages, pendingScans, sendChat.isPending, chatError, sendVoice.isPending, voiceError]
  );

  // ---- Actions ----
  const cardFor = useCallback((id: string): CardState => cards[id] ?? { tax: false, ok: false }, [cards]);

  const setCard = useCallback(
    (id: string, patch: Partial<CardState>) => {
      setCards(prev => ({ ...prev, [id]: { ...(prev[id] ?? { tax: false, ok: false }), ...patch } }));

      // Approving is the only place any of this is written. Which write depends
      // on what was proposed — an expense charged to a card is two of them, and
      // both are true: the money was spent, and the card now owes more.
      if (!patch.ok) return;
      const message = serverMessages.find(m => m.id === id);
      if (message?.type !== 'card') return;

      switch (message.action) {
        case 'income':
          addTransaction.mutate({
            merchant: message.source,
            category: 'income',
            // Positive, unlike the expense case below which negates. This is
            // the whole difference between the two, and it is what makes the
            // row count towards income rather than against it.
            amountMinor: eurToMinor(message.amountEur),
            note: message.note,
          });
          return;

        case 'card_payment':
          if (message.cardId) payoffCard.mutate({ id: message.cardId, amountMinor: eurToMinor(message.amountEur) });
          return;

        case 'sub_cancel':
          if (message.subId) updateSubscription.mutate({ id: message.subId, off: true });
          return;

        case 'sub_add':
          addSubscription.mutate({
            name: message.subName,
            // eurToMinor, not displayToMinor(_, baseCur): the amount came back
            // through minorToEur on the way in, so this is undoing that same
            // /100 — and it is in subCurrency, which the server stores as-is.
            priceMinor: eurToMinor(message.amountEur),
            dayOfMonth: message.dayOfMonth,
            currency: message.subCurrency,
            cardId: message.cardId,
          });
          return;

        case 'sub_edit':
          updateSubscription.mutate({
            id: message.subId,
            // Every field is optional and omitted when the coach did not
            // propose changing it, so the PATCH's COALESCE leaves it alone.
            priceMinor: message.amountEur == null ? undefined : eurToMinor(message.amountEur),
            dayOfMonth: message.dayOfMonth,
            currency: message.subCurrency,
            cardId: message.cardId,
          });
          return;

        default:
          addTransaction.mutate({
            merchant: message.merchant,
            category: message.cat,
            amountMinor: -eurToMinor(message.amountEur),
            note: message.note,
            taxDeductible: cards[id]?.tax ?? false,
            cardId: message.cardId,
            discountBank: message.discountBank,
            discountPercent: message.discountPercent,
            discountMinor: message.discountEur == null ? undefined : eurToMinor(message.discountEur),
          });
          if (message.cardId) {
            // The card is charged the same net amount: the discount is taken
            // off by the bank, so it never appears on the balance either.
            chargeCard.mutate({ id: message.cardId, amountMinor: eurToMinor(message.amountEur) });
          }
      }
    },
    [serverMessages, cards, addTransaction, chargeCard, payoffCard, addSubscription, updateSubscription]
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

  /**
   * Permission is requested here, at the moment recording is actually
   * attempted — not on app launch — so the system prompt appears with the
   * user's own action as its context rather than out of nowhere.
   */
  const startRec = useCallback(async () => {
    setMicError(null);
    const status = await AudioModule.requestRecordingPermissionsAsync();
    if (!status.granted) {
      setMicError('Microphone access is off. Enable it in your phone settings to record a voice note.');
      return;
    }
    // Idempotent and cheap enough to set on every recording rather than track
    // whether it already ran: allowsRecording lets iOS capture audio at all,
    // playsInSilentMode keeps other app audio behaving normally afterwards.
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await audioRecorder.prepareToRecordAsync();
    audioRecorder.record();
  }, [audioRecorder]);

  const endRec = useCallback(
    (commit: boolean) => {
      // Captured before stop() — some platforms reset the recorder's own
      // duration once it is no longer recording, and this is the only
      // account of elapsed time the app has (nothing decodes the file to
      // measure it, server included: the phone already knows).
      const secs = Math.max(Math.round(recorderState.durationMillis / 1000), 1);
      void (async () => {
        await audioRecorder.stop();
        if (!commit) return;
        const uri = audioRecorder.uri;
        if (!uri) return;

        const form = new FormData();
        // React Native's fetch accepts this { uri, name, type } shape as a
        // file part; it is not a spec Blob, hence the cast — see postForm in
        // src/api/client.ts.
        form.append('audio', { uri, name: 'note.m4a', type: 'audio/m4a' } as unknown as Blob);
        form.append('duration', String(secs));
        sendVoice.mutate(form);
      })();
    },
    [audioRecorder, recorderState.durationMillis, sendVoice]
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

  const updateSubscriptionDetails = useCallback(
    (input: { id: string; name?: string; price?: number; currency?: Currency; dayOfMonth?: number; cardId?: string | null }) => {
      // The price is converted with the *subscription's* currency, not the
      // account's: someone typing 9.99 against a USD subscription means 999
      // cents, and running that through a guaraní account's rule would store 10.
      const priceCurrency = input.currency ?? subs.find(s => s.id === input.id)?.currency ?? baseCur;
      updateSubscription.mutate({
        id: input.id,
        name: input.name,
        priceMinor: input.price != null ? displayToMinor(input.price, priceCurrency) : undefined,
        currency: input.currency,
        dayOfMonth: input.dayOfMonth,
        cardId: input.cardId,
      });
    },
    [updateSubscription, subs, baseCur]
  );

  const addCreditCard = useCallback(
    (input: { name: string; balance: number; limit: number; apr: number; color?: string }) => {
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
        // Falls back to the old rotation so a card added without ever
        // touching the picker still gets today's default behaviour.
        color: input.color ?? CARD_COLORS[creditCards.length % CARD_COLORS.length]!,
      });
    },
    [addCard, creditCards.length, baseCur]
  );

  const updateCreditCard = useCallback(
    (input: { id: string; name?: string; balance?: number; limit?: number; apr?: number; color?: string }) => {
      updateCard.mutate({
        id: input.id,
        name: input.name,
        balanceMinor: input.balance != null ? displayToMinor(input.balance, baseCur) : undefined,
        limitMinor: input.limit != null ? displayToMinor(input.limit, baseCur) : undefined,
        apr: input.apr,
        color: input.color,
      });
    },
    [updateCard, baseCur]
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
    recording: recorderState.isRecording,
    recSecs: Math.floor(recorderState.durationMillis / 1000),
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
    cardSheet,
    openAddCard: () => setCardSheet({ mode: 'add' }),
    openEditCard: (id: string) => setCardSheet({ mode: 'edit', id }),
    closeCardSheet: () => setCardSheet(null),
    addCreditCard,
    updateCreditCard,
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
    subSheet,
    openEditSub: (id: string) => setSubSheet({ id }),
    closeSubSheet: () => setSubSheet(null),
    updateSubscriptionDetails,

    todayOffersCat,
    openTodayOffers: (c: ApiDiscountCategory) => setTodayOffersCat(c),
    closeTodayOffers: () => setTodayOffersCat(null),

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
