# What it would take to make SpendOwl a real app

Everything today lives in one client-side React Context
(`src/store/SpendOwlContext.tsx`) with fixture data in
`src/store/mockData.ts`. There is no network call anywhere in the app —
"AI replies," receipt scans, and voice transcriptions are `setTimeout`s
that swap in canned data, and all state (messages, cards, vault, settings)
resets the moment the app reloads. Turning this into a working product
means replacing that one file with real services. Below is what each
mocked piece would need to become real, roughly in the order I'd build it.

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

## 3. The AI coach (replaces the canned `REPLIES` array)

`send()` in `SpendOwlContext.tsx` currently just cycles through 3 fixed
strings. A real coach needs:

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

The entire visual layer — `src/screens/`, `src/modals/`, `src/components/`
(charts, animations, the floating-pill nav, etc.) — doesn't need to
change shape. It's already built to read from `useSpendOwl()`; the work
above is about making what's *behind* that hook real, not rebuilding the UI.
