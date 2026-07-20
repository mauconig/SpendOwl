import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CatKey, Currency, PYG_PER_USD, formatPYG } from '../theme';
import {
  AFFORD_OPTS,
  CARD_COLORS,
  CreditCard,
  Msg,
  REPLIES,
  SAVINGS_TODAY,
  Subscription,
  VaultItem,
  creditCardsSeed,
  demoMsgs,
  firstMsgs,
  subsSeed,
  vaultBaseSeed,
} from './mockData';

// Design-time toggles in the original comp — fixed here for the real app.
const FIRST_RUN = false;
const OVER_BUDGET = false;
export const GLOW = true;

export type { Currency };
type CardState = { tax: boolean; ok: boolean };
export type Nav = 'pager' | 'chat' | 'vault' | 'settings';

function fmt(cur: Currency, eur: number, usd: number, pyg: number) {
  if (cur === 'EUR') return '€' + eur.toFixed(2);
  if (cur === 'USD') return '$' + usd.toFixed(2);
  return formatPYG(pyg);
}

interface SpendOwlStore {
  // shell
  nav: Nav;
  page: 0 | 1;
  setNav: (n: Nav) => void;
  setPage: (p: 0 | 1) => void;
  toggleChat: () => void;
  goDash: () => void;

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
  fmt: (cur: Currency, eur: number, usd: number, pyg: number) => string;

  // dashboard
  overBudget: boolean;
  selCat: CatKey | null;
  setSelCat: (c: CatKey | null) => void;

  // credit cards
  creditCards: CreditCard[];
  addCardOpen: boolean;
  openAddCard: () => void;
  closeAddCard: () => void;
  addCreditCard: (input: { name: string; last4: string; balance: number; limit: number; apr: number }) => void;
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
  vaultPatch: Record<string, 'ok' | 'warn'>;
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
  const [nav, setNav] = useState<Nav>('pager');
  const [page, setPage] = useState<0 | 1>(0);

  const [messages, setMessagesState] = useState<Msg[] | null>(null);
  const [input, setInput] = useState('');
  const [attachment, setAttachment] = useState(false);
  const [touched, setTouched] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const [cards, setCards] = useState<Record<string, CardState>>({});
  const [selCat, setSelCat] = useState<CatKey | null>(null);

  const [creditCards, setCreditCards] = useState<CreditCard[]>(() => creditCardsSeed());
  const [addCardOpen, setAddCardOpen] = useState(false);
  const [payoffCardId, setPayoffCardId] = useState<string | null>(null);
  const cardIdRef = useRef(100);

  const [affordOpen, setAffordOpen] = useState(false);
  const [affordSel, setAffordSel] = useState(1);

  const [subs, setSubs] = useState<Subscription[]>(() => subsSeed());
  const [subsOpen, setSubsOpen] = useState(false);

  const [vaultExtra, setVaultExtra] = useState<VaultItem[]>([]);
  const [vaultPatch, setVaultPatch] = useState<Record<string, 'ok' | 'warn'>>({});
  const [invOpen, setInvOpen] = useState<string | null>(null);

  const [baseCur, setBaseCur] = useState<Currency>('EUR');
  const [notif, setNotif] = useState(true);
  const [bio, setBio] = useState(false);

  const midRef = useRef(100);
  const replyIxRef = useRef(0);
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

  const msgsBase = useCallback((): Msg[] => messages ?? (FIRST_RUN ? firstMsgs() : demoMsgs()), [messages]);
  const pushM = useCallback(
    (items: Msg[]) => setMessagesState([...msgsBase(), ...items]),
    [msgsBase]
  );

  const cardFor = useCallback((id: string): CardState => cards[id] ?? { tax: false, ok: false }, [cards]);
  const setCard = useCallback(
    (id: string, patch: Partial<CardState>) =>
      setCards(prev => ({ ...prev, [id]: { ...(prev[id] ?? { tax: false, ok: false }), ...patch } })),
    []
  );

  const send = useCallback(() => {
    if (attachment) {
      const sid = 's' + midRef.current++;
      const rid = 'r' + midRef.current;
      pushM([{ id: rid, type: 'receipt' }, { id: sid, type: 'scanning' }]);
      setAttachment(false);
      setInput('');
      after(2600, () => {
        setMessagesState(prev =>
          (prev ?? []).map(m =>
            m.id === sid
              ? { id: sid, type: 'card', merchant: 'Mercado Central', cat: 'food', eur: 23.8, usd: 25.9, pyg: Math.round(25.9 * PYG_PER_USD), note: '3 items · Groceries · scanned' }
              : m
          )
        );
        setVaultExtra(prev => [
          { id: 'vx' + sid, merchant: 'Mercado Central', date: 'Jul 17', amount: '€23.80', usd: '$25.90', pyg: formatPYG(25.9 * PYG_PER_USD), status: 'ok', seed: 2, cat: 'Food & Drink' },
          ...prev,
        ]);
      });
      return;
    }
    const text = input.trim();
    if (!text) return;
    pushM([{ id: 'u' + midRef.current++, type: 'user', text }]);
    setInput('');
    const r = REPLIES[replyIxRef.current++ % REPLIES.length];
    after(900, () => pushM([{ id: 'a' + midRef.current++, type: 'ai', text: r }]));
  }, [attachment, input, pushM, after]);

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
          const vid = 'v' + midRef.current++;
          pushM([{ id: vid, type: 'voice', dur: '0:' + String(secs).padStart(2, '0') }]);
          after(1400, () =>
            pushM([{ id: 'c' + midRef.current++, type: 'card', merchant: 'Blue Bottle Coffee', cat: 'food', eur: 4.5, usd: 4.9, pyg: Math.round(4.9 * PYG_PER_USD), note: 'Voice note · transcribed' }])
          );
        }
        return 0;
      });
    },
    [pushM, after]
  );

  const attach = useCallback(() => {
    setAttachment(true);
    setTouched(true);
  }, []);

  const vaultBase = useMemo(() => vaultBaseSeed(FIRST_RUN), []);
  const vaultItems = useMemo(() => [...vaultExtra, ...vaultBase], [vaultExtra, vaultBase]);

  const openInvoice = useCallback((id: string) => setInvOpen(id), []);
  const closeInvoice = useCallback(() => setInvOpen(null), []);
  const approveInvoice = useCallback(() => {
    if (!invOpen) return;
    setVaultPatch(prev => ({ ...prev, [invOpen]: 'ok' }));
  }, [invOpen]);

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

  const toggleSubMute = useCallback((id: string) => setSubs(prev => prev.map(s => (s.id === id ? { ...s, muted: !s.muted } : s))), []);
  const toggleSubOff = useCallback((id: string) => setSubs(prev => prev.map(s => (s.id === id ? { ...s, off: !s.off } : s))), []);

  const addCreditCard = useCallback((input: { name: string; last4: string; balance: number; limit: number; apr: number }) => {
    const id = 'cc' + cardIdRef.current++;
    setCreditCards(prev => [...prev, { id, color: CARD_COLORS[prev.length % CARD_COLORS.length], ...input }]);
  }, []);
  const removeCreditCard = useCallback((id: string) => setCreditCards(prev => prev.filter(c => c.id !== id)), []);
  const openPayoff = useCallback((id: string) => setPayoffCardId(id), []);
  const closePayoff = useCallback(() => setPayoffCardId(null), []);

  const value: SpendOwlStore = {
    nav,
    page,
    setNav,
    setPage,
    toggleChat,
    goDash,

    messages: msgsBase(),
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
    firstRun: FIRST_RUN,
    cardFor,
    setCard,
    fmt,

    overBudget: OVER_BUDGET,
    selCat,
    setSelCat,

    creditCards,
    addCardOpen,
    openAddCard: () => setAddCardOpen(true),
    closeAddCard: () => setAddCardOpen(false),
    addCreditCard,
    removeCreditCard,
    payoffCardId,
    openPayoff,
    closePayoff,

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
    vaultPatch,
    invOpen,
    openInvoice,
    closeInvoice,
    approveInvoice,
    scanFirst,

    baseCur,
    setBaseCur,
    notif,
    toggleNotif: () => setNotif(v => !v),
    bio,
    toggleBio: () => setBio(v => !v),
  };

  return <SpendOwlCtx.Provider value={value}>{children}</SpendOwlCtx.Provider>;
}

export function useSpendOwl() {
  const ctx = useContext(SpendOwlCtx);
  if (!ctx) throw new Error('useSpendOwl must be used within SpendOwlProvider');
  return ctx;
}

export { AFFORD_OPTS, SAVINGS_TODAY };
