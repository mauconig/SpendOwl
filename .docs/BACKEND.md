# What it would take to make SpendOwl a real app

This document was written when the whole app ran on client-side fixtures. Some
of it is now history rather than a plan — see the status box below before
following any section.

> ## Status
>
> **Done — §1 (accounts, database, API), §2 (transactions & budgets), and
> §3 (the AI coach).** Clerk handles auth; a Hono + Postgres API in `server/`
> owns all data, scoped per user; the client reads it through React Query behind
> the unchanged `useSpendOwl()` hook. Transactions, budgets, category totals and
> the spending trajectory are real, computed by `GET /api/summary`. New accounts
> are seeded with a demo month on first sign-in. Verified: two accounts cannot
> see each other's rows, and data survives an app restart.
>
> §3 landed as `POST /api/chat` (`server/src/routes/chat.ts`) — a real
> tool-using coach over live transaction data. It runs on **DeepSeek**, not
> Anthropic: DeepSeek publishes an Anthropic-compatible endpoint, so the same
> `@anthropic-ai/sdk` client talks to it and the provider is three env vars
> (`LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`), never a code change. A turn
> costs roughly **$0.0007** versus ~$0.037 on a frontier model, which is what
> made the feature worth shipping at all.
>
> **Not done — everything else.** §4 (receipt OCR), §5 (voice
> transcription), §6 (subscription *detection* — CRUD exists, detection does
> not), §7 (multi-currency — the app no longer converts *at all*; see below),
> §8 (push notifications — the `notif` toggle persists but nothing
> reads it), §9 (biometric lock — same, `bio` persists but does not gate
> anything).
>
> Also still fake: `SAVINGS_TODAY` in `src/store/constants.ts`, which the
> "Can I afford this?" sandbox uses. There is no savings/accounts table; that
> arrives with bank linking (§2's optional half).
>
> The suggested build order at the bottom remains sound for what's left.
> **Next up is §4**, receipt capture → upload → extraction, since that is the
> app's signature flow — and the coach's tool loop is already there to hang it
> off.

Historically: everything lived in one client-side React Context
(`src/store/SpendOwlContext.tsx`) with fixture data in `src/store/mockData.ts`
(now deleted). There was no network call anywhere in the app, and all state
reset the moment the app reloaded. Below is what each mocked piece needs to
become real, roughly in the order I'd build it.

## 1. Accounts & sync (the foundation everything else needs)

Right now there's exactly one implicit user ("Maya Fernández", hardcoded in
`SettingsScreen.tsx`) and zero persistence. Before anything else:

- **Auth** — sign-up/login (email+password or OAuth), session tokens
  (short-lived JWT + refresh token is the standard mobile pattern).
- **A backend API** the app talks to instead of mutating local state
  directly — REST or GraphQL, doesn't matter much at this size. Every
  action currently handled inside `SpendOwlContext.tsx` (`send()`,
  `setCard()`, `toggleSubOff()`, etc.) becomes a request to this API
  instead of a local `setState`.
- **A database** — Postgres is the obvious default. Rough tables:
  `users`, `transactions`, `categories`, `receipts`, `subscriptions`,
  `budgets`. The shapes in `mockData.ts` (`TxRow`, `VaultItem`,
  `Subscription`, `CATS`) are a decent starting schema sketch.
- **Client state** — swap the Context's local `useState`s for a
  server-state library (React Query / TanStack Query works well with
  Expo) so screens fetch/cache/mutate against the API instead of an
  in-memory store. The current `useSpendOwl()` hook shape can mostly
  stay as the interface screens call — only its internals change from
  "local state" to "cached API calls."

## 2. Real transactions & budgets (replaces `TX`, `CATS`, the hero number)

- CRUD endpoints for transactions and a manually-configured monthly
  budget (what `DashboardScreen.tsx`'s hero number, progress bar, donut,
  and "Recent" list currently fake with hardcoded numbers).
- Category spend totals (`CATS[k].amount`) become a SQL aggregate
  (`SUM(amount) WHERE category = ? AND month = ?`), not a static object.
- The spending-trajectory chart's cumulative series (`TREND_CUR` in
  `mockData.ts`) becomes a real day-by-day cumulative sum query.
- **Optional, much bigger scope**: instead of manual entry, link real
  bank/card accounts via an open-banking aggregator (Plaid, TrueLayer,
  Tink, GoCardless depending on region — Maya's `.eu` email suggests
  PSD2/EU coverage matters, i.e. TrueLayer/GoCardless over Plaid). This
  is what would make "Recent transactions" and subscription detection
  real instead of hand-entered, but it's a serious integration on its
  own (bank consent flows, webhook ingestion, transaction categorization
  ML/rules).

## 3. The AI coach — **done**

> **Shipped.** `send()` no longer cycles fixed strings; it posts to
> `POST /api/chat`, which persists the user's message, replays ~30 messages of
> history to the model with five tools bound to that user's rows, and persists
> the reply. Read `server/src/routes/chat.ts` rather than the plan below.
>
> Three decisions worth knowing before changing it:
>
> - **`propose_expense` writes nothing.** It emits the existing `card` message
>   and the user's "Approve & log" button still does the insert, so no model
>   mistake reaches the database unreviewed. Tool descriptions say so explicitly
>   — if you loosen that, the approve flow becomes dead code.
> - **The tool loop is hand-written** against plain `messages.create`, not the
>   SDK's beta `toolRunner`. The beta namespace is the least likely part of a
>   compatibility layer to be implemented, and we are on one. Capped at 6
>   iterations.
> - **Tool arguments are zod-validated before execution**, with failures
>   returned as `is_error` tool results so the model self-corrects. This matters
>   more on a cheap model than it would on a frontier one.
> - **Past `card` messages are replayed into history as real
>   `tool_use`/`tool_result` pairs**, not as prose. This is load-bearing, not
>   cosmetic. They were originally rendered as an assistant line reading
>   `[Proposed an expense card for ...]`, which described a tool call as
>   something the assistant had *written* — so after one card existed the model
>   answered later purchases with a prose description and never called the tool.
>   Measured at **1/8** turns working; replaying them as genuine tool calls took
>   the same case to **8/8**. `server/repro-coach.ts` is the harness that
>   measured it; re-run it before changing the prompt or the history shape,
>   because these failures are stochastic and cannot be spotted by eye.
>
> Streaming was considered and rejected: React Native's `fetch` is XHR-backed
> and does not expose `response.body`, so SSE would need a dependency Expo Go
> can't load. The client shows a typing indicator instead.

The original plan, for context:

- A backend endpoint that takes the chat history + the user's real
  transaction/budget data and calls an LLM (Claude API is the natural
  fit) with a system prompt describing SpendOwl's persona and the tools
  it can call.
- **Tool use / function calling** so the model can actually take action
  — log an expense, look up "what's safe to spend," flag a subscription
  — rather than just producing text. Each of the model's current
  hardcoded actions (logging a card, categorizing it, answering "what's
  safe to spend?") maps to one tool.
- Streaming responses back to the client (the chat UI already animates
  message-in, so streaming token-by-token is a nice upgrade over the
  current instant canned reply).

## 4. Receipt scanning (replaces the `Paper` placeholder + fake "scanning" delay)

Today, attaching a "receipt" just shows a static placeholder graphic for
2.6s and then always resolves to the same "Mercado Central, €23.80" card
(`send()` in `SpendOwlContext.tsx`). A real pipeline needs:

- **Camera/image picker** on the client (`expo-image-picker` or
  `expo-camera`) to actually capture a photo instead of faking one.
- **Upload** the image to object storage (S3-compatible: S3, R2,
  Supabase Storage) and store a reference on the `receipts` row.
- **OCR/extraction** — Claude's vision input is a good fit here (send the
  receipt image, ask for structured JSON: merchant, date, line items,
  total, VAT number, currency) instead of a dedicated OCR vendor; a
  dedicated OCR API (Google Document AI, AWS Textract, Mindee) is the
  alternative if you want a specialized invoice/receipt parser.
- The "needs review" / VAT-missing state (`invIsWarn` in
  `InvoiceDetail.tsx`) becomes a real confidence check on the extraction
  output rather than a hardcoded `seed`-based flag.

## 5. Voice notes (replaces the fake transcription)

- **Audio recording** on the client (`expo-av` / `expo-audio`) instead of
  just running a timer and a waveform animation.
- Upload the audio clip, run it through a **speech-to-text** service
  (Whisper API, Google Speech-to-Text, or Claude's audio support once
  available) to get a transcript, then feed that transcript into the
  same AI-coach pipeline from #3 to parse an expense out of it.

## 6. Subscriptions (replaces the hardcoded `subsSeed()`)

- If not using bank-linked transaction data (#2), subscriptions stay
  manually entered — needs simple CRUD instead of a fixed 4-item array.
- If bank-linked, subscription *detection* is a recurring-charge pattern
  match over transaction history (same merchant, ~monthly cadence,
  similar amount) — a background job, not something the client computes.
- "Mute alerts" / "Log cancelled" (`toggleSubMute`/`toggleSubOff`) need
  to actually suppress/trigger notifications server-side (#8), not just
  flip a local boolean.

## 7. Currency conversion (replaces hardcoded `eur`/`usd` pairs)

> **Update: conversion was removed rather than improved.** The app used to
> render every amount through a hardcoded EUR/USD/PYG rate table in
> `theme.ts`. Those were invented demo values, so converting through them added
> error and implied an accuracy the app did not have — and it made the coach
> wrong, since a user on PYG saying "5k" means ₲5,000, not €50.
>
> `formatMoney()` now changes the symbol and the precision only. The minor unit
> is the cent for EUR/USD and the guaraní for PYG, mirrored server-side in
> `server/src/currency.ts`. Everything below still stands as the real fix; there
> is simply no longer a fake conversion pretending to be it.

Every mock transaction currently carries *both* a EUR and a USD amount
pre-computed by hand. A real app stores the transaction in its original
currency and converts on read using a live FX rate (an FX API like
exchangerate.host, Open Exchange Rates, or your bank-aggregator's own
rates) — with the Settings "Base currency" toggle (already wired up)
controlling which currency conversions target.

## 8. Notifications (budget alerts, the `notif` toggle)

- Push notifications (Expo Push / FCM / APNs) triggered by a backend job
  that watches spend-vs-budget and subscription renewal dates, gated by
  the user's `notif` setting.
- Requires the client to register a push token with the backend on
  login/app-start.

## 9. Auth-adjacent settings that need real plumbing

- **Biometric lock** (`bio` toggle) — actually gate app access using
  `expo-local-authentication` (Face ID/fingerprint) on launch/resume,
  rather than just storing a boolean.
- **Tax deductible flag / Q3 return** — if this is meant to produce an
  actual export, that's a report-generation endpoint (PDF/CSV of
  tax-deductible transactions for a date range), not just a per-card flag.

## Suggested build order

1. Auth + Postgres + CRUD API for transactions/budgets/categories, swap
   `SpendOwlContext` to call it via React Query. (Nothing works without
   this; everything else builds on top.)
2. Receipt capture → upload → Claude-vision extraction → transaction
   creation. This is the app's signature flow, worth getting real early.
3. Voice capture → transcription → same expense-creation path as #2.
4. LLM-backed chat coach with tool use over the now-real transaction data.
5. Notifications + biometric lock (relatively self-contained, can slot in
   any time).
6. FX rates for real multi-currency support.
7. Bank-account linking (Plaid/TrueLayer/GoCardless) — biggest scope
   item, only worth it once manual entry is validated with real users.

## What can stay as-is

Most of the visual layer — `src/modals/`, and components like the nav,
animations and card list — reads everything through `useSpendOwl()` and did
not change when the backend landed.

> **Correction.** This section previously claimed the *entire* visual layer
> needed no changes. That turned out to be wrong, and it was the single
> biggest surprise in building step 1. Four files bypassed the hook and read
> fixtures directly: `TrendChart.tsx` imported `TREND_CUR`,
> `DashboardScreen.tsx` imported `TX`, and `Donut.tsx` read spend totals out
> of `CATS` in `theme.ts` — a *theme* file that held money. On top of that,
> the Dashboard's hero number, budget, pace line and progress bar were
> hardcoded literals (`1283.65`, `2400`, `46.5%`, `'14 days left'`), as were
> the Home screen's stat tiles and all four of its "insights" — one of which
> deep-linked to a hardcoded fixture id that no longer exists.
>
> Worse, the fixtures did not agree with each other: `CATS` claimed €1,116 of
> monthly spend while the `TX` list accounted for about €165 of it. Nothing
> forced them to match, because nothing computed one from the other. Real
> aggregates do have to match, which is why the seed data is a full month of
> transactions rather than the original seven.
>
> Budget the UI rewiring as real work in any future slice, and be suspicious
> of "the UI already reads from the hook" as a blanket claim.
