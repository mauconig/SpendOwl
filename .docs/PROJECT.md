# SpendOwl

SpendOwl is a mobile finance-coach app: a chat-driven AI assistant for logging
expenses (by text, voice note, or receipt photo), plus a dashboard, a receipt
vault, and settings. This repo is a React Native (Expo) implementation of a
design comp (`SpendOwl.dc.html`) originally built in Claude's design tool.

**Authentication and data are both real.** Clerk (`@clerk/expo`) handles
sign-in — email + password with an emailed code, plus Google and Apple — and a
Hono + Postgres API in `server/` owns everything else, scoped per Clerk user.
Two accounts see entirely separate data, and it survives app restarts.

Still simulated: the AI coach's replies, receipt scanning, and voice
transcription remain canned results on fixed delays. The server persists them
but does not generate them — no LLM and no OCR are wired up yet.

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

**Money is stored as integer EUR cents** everywhere, never floats. The client
converts at the render boundary with the existing `formatMoney()`. This
replaced the old fixtures' hand-computed `eur`/`usd`/`pyg` triples on every row.

On the client, `@tanstack/react-query` holds server state and
`SpendOwlContext.tsx` keeps its original `useSpendOwl()` surface — screens read
the same shapes as before, mapped from the API in one place. UI-only state
(nav, modal flags, chat input, recording) stays local `useState`.
`src/api/client.ts` derives the API host from the Metro dev-server address,
because Expo Go runs on the phone where `localhost` is the phone itself.

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
  month and a list of "for you today" insight cards. Every card is derived from
  live data: budget pace, the top spending category and its share, upcoming
  subscription renewals, and facturas needing review (which deep-links to a
  real receipt id).
- **Dashboard** (`src/screens/DashboardScreen.tsx`) — safe-to-spend hero number
  and budget progress bar, a tappable category donut, a filterable transaction
  list, a spending-trajectory chart with a budget-pace reference line, the
  credit-cards section, a "Can I afford this?" sandbox, and a subscriptions
  summary. All figures come from `GET /api/summary`.
- **Chat** (`src/screens/ChatScreen.tsx`) — the coach conversation. Supports:
  - Typing a message and getting a canned AI reply.
  - Attaching a "photo" of a receipt (`factura`), which shows a scanning
    animation and then resolves to an expense card.
  - Recording a voice note, which produces a transcribed expense card.
  - Expense cards can be marked tax-deductible and approved — "approve & log"
    writes a real transaction via `POST /api/transactions`.
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
  `Msg` union, the canned `REPLIES`, the afford-modal options.
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
