# SpendOwl

SpendOwl is a mobile finance-coach app: a chat-driven AI assistant for logging
expenses (by text, voice note, or receipt photo), plus a dashboard, a receipt
vault, and settings. This repo is a React Native (Expo) implementation of a
design comp (`SpendOwl.dc.html`) originally built in Claude's design tool.

**Authentication and data are both real.** Clerk (`@clerk/expo`) handles
sign-in — email + password with an emailed code, plus Google and Apple — and a
Hono + Postgres API in `server/` owns everything else, scoped per Clerk user.
Two accounts see entirely separate data, and it survives app restarts.

**The AI coach is also real.** `POST /api/chat` runs a tool-using model over the
user's live transaction data — see the Coach section below.

Still simulated: receipt scanning and voice transcription remain canned results
on fixed delays. The server persists them but does not generate them — no OCR
and no speech-to-text are wired up yet.

## Backend

`server/` is a separate Node package (its own `package.json`, excluded from the
app's `tsconfig.json` and from Metro via `metro.config.js`). It runs TypeScript
directly on Node's native type stripping, so there is no build step.

- **`server/src/migrations.ts`** — ordered migrations applied at boot under a
  Postgres advisory lock. Tables: `users`, `transactions`, `receipts`,
  `subscriptions`, `credit_cards`, `messages`.
- **`server/src/auth.ts`** — verifies the Clerk session token via
  `@clerk/backend`'s `verifyToken`; the `sub` claim is the user id. Every query
  scopes on it, and it is the only tenancy mechanism, so a route that forgets
  to filter by `user_id` leaks another account's data.
- **`server/src/seed.ts`** — on the first authenticated request from an unknown
  user, creates their row and seeds a month of demo data. Lazy provisioning
  means no Clerk webhooks are needed.
- **`GET /api/summary`** is the important one: safe-to-spend, budget progress,
  pace, per-category totals and the cumulative trend series, all `SUM()`ed from
  real rows. These used to be hardcoded literals in the UI.

**Money is stored as integer minor units** everywhere, never floats. The client
formats at the render boundary with `formatMoney()`. This replaced the old
fixtures' hand-computed `eur`/`usd`/`pyg` triples on every row.

What a minor unit *means* depends on the currency: for EUR and USD it is the
cent, for PYG it is the guaraní, which has no subunit. So a stored `5000` reads
as `€50.00` and as `₲5.000`. **`formatMoney()` does not convert** — changing
base currency changes the symbol and the precision, nothing else. The rate table
that used to live in `theme.ts` held invented demo values, so converting through
it only added error and implied an accuracy the app never had. The server mirrors
this rule in `server/src/currency.ts`; the two must agree or the coach will quote
one number while the Dashboard draws another.

On the client, `@tanstack/react-query` holds server state and
`SpendOwlContext.tsx` keeps its original `useSpendOwl()` surface — screens read
the same shapes as before, mapped from the API in one place. UI-only state
(nav, modal flags, chat input, recording) stays local `useState`.
`src/api/client.ts` derives the API host from the Metro dev-server address,
because Expo Go runs on the phone where `localhost` is the phone itself.

## Coach

`POST /api/chat` (`server/src/routes/chat.ts`) runs an entire turn server-side:
it persists the user's message, replays the last ~30 messages as conversation
history, calls the model with five tools scoped to that user's rows, and
persists the reply. The client posts text and refetches — it never sees an API
key, a tool definition, or a tool call.

**It runs on DeepSeek, through `@anthropic-ai/sdk`.** DeepSeek publishes an
Anthropic-compatible endpoint (`https://api.deepseek.com/anthropic`), so the
provider is entirely a matter of three env vars — `LLM_API_KEY`,
`LLM_BASE_URL` (default that endpoint), `LLM_MODEL` (default
`deepseek-v4-flash`). Pointing this at Anthropic proper is an env change and a
restart. A turn costs about **$0.0007** against roughly $0.037 on a frontier
model; that ratio is why the feature exists.

The tools are `get_budget_summary`, `list_transactions`, `list_subscriptions`,
`list_credit_cards`, and `propose_expense`. The first shares `getSummary()` in
`server/src/summary.ts` with the `/api/summary` endpoint, so the coach and the
Dashboard can never quote different numbers for the same month.

`propose_expense` is the important one: **it writes nothing.** It emits the
existing `card` message, and the user's "Approve & log" button performs the
insert exactly as it did when the card was faked. No model mistake reaches the
database unreviewed, and `CardMessage` in `ChatScreen.tsx` stays load-bearing.

A draft can also be **rejected**, which `DELETE`s the message rather than
flagging it. That matters beyond tidiness: a rejected card left in the
transcript is also left in the history replayed to the coach, and a stale draft
is precisely the context that convinces it a purchase has already been handled.
Reject is offered only before approval — afterwards a real transaction exists,
and removing just the card would misrepresent that.

Three implementation notes that are easy to undo by accident:

- The tool loop is **hand-written** against plain `client.messages.create`, not
  the SDK's beta `toolRunner`. We are talking to a compatibility layer, and the
  beta namespace is the part least likely to be implemented. Capped at six
  iterations so a model that ping-pongs between tools can't run away.
- **No Anthropic-specific parameters are sent** — no `thinking`, no
  `output_config.effort`, no `betas`. Only the lowest-common-denominator
  Messages API that a shim is most likely to get right. (Insights, below,
  deliberately breaks this rule after measuring that it holds.)
- Tool arguments are **zod-validated before execution**, with failures returned
  as `is_error` tool results so the model corrects itself rather than the turn
  throwing. A cheaper model emits malformed arguments more often than a
  frontier one.

Streaming was considered and rejected: React Native's `fetch` is XHR-backed and
does not expose `response.body`, so token streaming would need a dependency
Expo Go cannot load. The client shows a typing indicator for the duration
instead — `useSendChat` keeps its mutation pending through the messages refetch
so the indicator hands off to the rendered reply with no gap.

## Insights

The Home screen's "For you today" cards (`server/src/insights.ts`). Same model
and same env vars as the coach, but a different shape in three ways worth
knowing before changing any of them.

**No tool loop.** We already know which data is relevant, so `buildSnapshot()`
gathers it — `getSummary()`, the last 25 transactions, subscriptions, cards,
facturas needing review — and hands it over in a single `messages.create()`. The
model never decides what to fetch; it only notices and phrases. One request,
bounded latency. `trend` is dropped from the summary for the same reason the
coach drops it.

**The tool is the output schema.** `emit_insights` is forced with `tool_choice`,
so a card arrives as a zod-validated object rather than prose to be parsed. This
is where the "no Anthropic-specific parameters" rule is broken on purpose:
forcing a tool is rejected outright by DeepSeek while thinking mode is on, so
the request also sends `thinking: { type: 'disabled' }`. Both were measured
against the live endpoint before being written in — disabling thinking also
roughly halves output tokens for a task that is noticing, not reasoning.

**Cached for a day, in Postgres.** The `insights` table stores *rendered prose*,
not figures — the amounts are already formatted into `title`/`body`. That is why
`currency` is a column: freshness is `generated_on = CURRENT_DATE AND currency =
<the user's current one>`, so switching currency in Settings invalidates the day
for free. `GET /api/insights` is a pure cache read and never blocks on a model;
`POST /api/insights/refresh` is the only thing that can spend money, and it
regenerates only when the day's set is missing — that, rather than a rate
limiter, is what caps it at one call per user per day. Generation takes
`pg_advisory_xact_lock` and re-checks freshness under it, because two Home
mounts racing on app open is the expected case, not an edge one.

A card names an `action` (`chat` / `dashboard` / `subscriptions` / `vault`)
rather than carrying a closure, and `HomeScreen` resolves it. A `vault` card may
carry a `targetId` to deep-link to one factura — the server drops any id it did
not itself hand to the model, so a hallucinated uuid degrades the card to "open
the vault" instead of navigating somewhere wrong. The icon is chosen from a
fixed set; **the colour is not**, and is derived client-side, because a model
picking hex values only ever drifts off-palette.

The whole feature is optional at runtime. Every failure path — no `LLM_API_KEY`,
a 502, a malformed tool call, generation still in flight — leaves `insights`
empty, and Home renders `buildFallbackInsights()` instead. `insightsQuery` is
deliberately kept out of the array that drives global `loading`/`error` in
`SpendOwlContext` so a slow generation can never put the app behind a spinner.

## Authentication

`App.tsx` wraps the app in `<ClerkProvider>` with the `expo-secure-store`
token cache, so sessions are encrypted in the device keychain and survive
restarts. A `Gate` component inside the provider reads `useAuth()` and either
renders `AuthScreen` (signed out) or the usual `SpendOwlProvider` +
`RootScreen` (signed in); it also holds the splash screen until Clerk has
finished restoring a cached session.

`src/screens/AuthScreen.tsx` is a custom flow built on `useSignIn()` /
`useSignUp()` — not Clerk's prebuilt components, which need a native dev build
and would break Expo Go. It uses the current method-based v4 API
(`signIn.password()`, `signUp.verifications.verifyEmailCode()`,
`finalize()`), *not* the legacy `setActive`/`prepareFirstFactor` shape, and
renders a `nativeID="clerk-captcha"` mount point because the instance has bot
protection enabled. Sign-out lives at the bottom of the Settings screen.

Note that the app deliberately does **not** use Expo Router, so none of
Clerk's router-based examples apply — `finalize()` is called with no
`navigate` argument and the UI switches over because `useAuth()` re-renders.

Google and Apple go through `useSSO()` — the *browser* flow (`expo-auth-session`
+ `expo-web-browser`), which is the only social option that works in Expo Go.
Clerk's fully-native Google/Apple sheets (`@clerk/expo/google`, `/apple`) would
need a custom dev build, and the native Apple sheet is iOS-only. SSO is also
the one flow that still uses `setActive({ session })` rather than `finalize()`.
The `"scheme": "spendowl"` entry in `app.json` is the deep-link target for the
OAuth redirect and must stay.

Both providers currently run on **Clerk's shared development credentials**, so
they work with zero provider-side setup — but that only applies to the dev
instance. Production needs a real Google Cloud OAuth client, and for Apple an
Apple Developer Program membership plus an App ID, Services ID, and signing
key. See `.docs/BACKEND.md` before shipping.

## Screens

Five destinations, all on one horizontal pager (see Root composition below):

- **Home** (`src/screens/HomeScreen.tsx`) — spent/income tiles for the current
  month and a list of "for you today" insight cards. The cards are written by
  the model once a day from a snapshot of the account (see Insights below), and
  each carries an `action` the screen resolves to a destination. When there are
  none — no API key, a failed call, or the day's first generation still in
  flight — it falls back to `buildFallbackInsights()`, the four original rules:
  budget pace, the top spending category and its share, upcoming subscription
  renewals, and facturas needing review (which deep-links to a real receipt id).
- **Dashboard** (`src/screens/DashboardScreen.tsx`) — safe-to-spend hero number
  and budget progress bar, a tappable category donut, a filterable transaction
  list, a spending-trajectory chart with a budget-pace reference line, the
  credit-cards section, a "Can I afford this?" sandbox, and a subscriptions
  summary. All figures come from `GET /api/summary`.
- **Chat** (`src/screens/ChatScreen.tsx`) — the coach conversation. Supports:
  - Typing a message and getting a real, tool-grounded reply (see Coach below).
  - Attaching a "photo" of a receipt (`factura`), which shows a scanning
    animation and then resolves to an expense card.
  - Recording a voice note, which produces a transcribed expense card.
  - Expense cards can be marked tax-deductible, approved, or rejected —
    "approve & log" writes a real transaction via `POST /api/transactions`,
    "reject" deletes the draft via `DELETE /api/messages/:id`.
- **Factura Vault** (`src/screens/VaultScreen.tsx`) — a grid of scanned
  receipts with an ok/needs-review badge; tapping one opens the full invoice
  detail view.
- **Settings** (`src/screens/SettingsScreen.tsx`) — profile (the real signed-in
  Clerk user's name and email), base currency, budget alerts, biometric lock
  toggle, static preference rows, and sign-out.

Five overlays live outside the pager: the **"Can I afford this?"** sandbox
(`src/modals/AffordModal.tsx`), the **Subscriptions** sheet
(`src/modals/SubscriptionsSheet.tsx`), **Add card**
(`src/modals/AddCardSheet.tsx`) and the **payoff calculator**
(`src/modals/CardPayoffModal.tsx`) — both reached from the Dashboard's cards
section — and **Invoice detail** (`src/modals/InvoiceDetail.tsx`), opened by
tapping a vault item.

Note the payoff modal is a *calculator* only: it models payment schedules using
`src/utils/payoff.ts` but does not record a payment. `POST
/api/credit-cards/:id/payoff` exists and works if you want to wire that up.

## Architecture

- **State**: a single React Context store (`src/store/SpendOwlContext.tsx`,
  exposed via the `useSpendOwl()` hook) is still the one thing screens and
  modals read from, but it is now a thin layer over React Query rather than
  the source of truth. It maps API responses (integer cents) to the view
  models the screens already render (EUR numbers, ordinal days, formatted
  dates), and keeps UI-only state local.
- **API layer**: `src/api/` — `client.ts` (fetch wrapper, Clerk token, host
  detection), `hooks.ts` (React Query queries and mutations), `types.ts` (wire
  shapes plus `minorToEur`/`eurToMinor`).
- **Demo content**: lives server-side in `server/src/seed.ts`, not in the app.
  `src/store/constants.ts` holds what genuinely is client-side constant — the
  `Msg` union and the afford-modal options. (It used to hold the coach's canned
  `REPLIES` too; those are gone.)
- **Theme**: `src/theme.ts` has the color palette, category colors, and font
  family names. It deliberately holds **no** amounts — category spend totals
  used to live here and now come from `GET /api/summary`.
- **Icons**: `src/icons.tsx` renders the app's icon set from raw SVG path
  data via `react-native-svg`.
- **Shared UI components** live in `src/components/` (toggle switch, the
  animated voice waveform, the scanning laser overlay, the donut and trend
  charts — both of which take their data as props — the receipt "paper"
  placeholder, the credit-cards section, the Google/Apple brand marks, the
  header, and the bottom nav bar).
- **Root composition**: `src/RootScreen.tsx` puts all five destinations on a
  single horizontal `ScrollView` pager in bottom-nav order (Home, Dashboard,
  Chat, Vault, Settings), so tapping the nav and swiping animate through the
  same transition. It renders the header, the pager, the bottom nav, and
  mounts the five modals.
- **Load gate**: `App.tsx` nests `SafeAreaProvider` → `ClerkProvider` →
  `QueryClientProvider` → `Gate` (signed in?) → `SpendOwlProvider` →
  `DataGate` (data loaded?). Screens below `DataGate` can assume their data
  exists; `src/screens/LoadingScreen.tsx` covers the first load and the
  can't-reach-the-API case.

## Notable implementation choices

- The original design comp is web/CSS-based (gradients, box-shadows, CSS
  `@keyframes`, inline SVG). This was ported to native equivalents:
  `expo-linear-gradient` for gradients, `expo-blur` for the afford-modal
  backdrop blur, `react-native-svg` for icons and charts, and the `Animated`
  API for the waveform/laser/typing-dots/message-entrance animations.
- The donut chart's segment math was rewritten to use real circumference
  (`2πr`) instead of the web version's `pathLength="100"` percentage trick,
  since `react-native-svg` doesn't reliably support `pathLength`.
- The design comp's fake Android device bezel (`android-frame.jsx`) was
  **not** ported — that was preview-only scaffolding for the design tool.
  This app runs full-screen as itself.
