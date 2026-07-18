# SpendOwl

SpendOwl is a mobile finance-coach app: a chat-driven AI assistant for logging
expenses (by text, voice note, or receipt photo), plus a dashboard, a receipt
vault, and settings. This repo is a React Native (Expo) implementation of a
design comp (`SpendOwl.dc.html`) originally built in Claude's design tool.

The app currently runs entirely on **mocked data** — there is no real backend,
AI, or OCR yet. Every "AI reply," receipt scan, and voice transcription is a
canned response fired after a `setTimeout`, so the full experience can be
demoed end-to-end without any network calls.

## Screens

- **Chat** (`src/screens/ChatScreen.tsx`) — the coach conversation. Supports:
  - Typing a message and getting a canned AI reply.
  - Attaching a "photo" of a receipt (`factura`) and sending it, which shows a
    scanning animation and then a swipeable expense card.
  - Recording a voice note, which produces a transcribed expense card.
  - Expense cards let you flip currency (EUR/USD), mark as a tax-deductible
    business expense, and approve & log them.
- **Dashboard** (`src/screens/DashboardScreen.tsx`) — safe-to-spend hero
  number and progress bar, a tappable category donut chart, a filterable
  recent-transactions list, a spending-trajectory line chart, a "Can I afford
  this?" sandbox, and a subscriptions summary.
- **Factura Vault** (`src/screens/VaultScreen.tsx`) — a grid of scanned
  receipts with an ok/needs-review badge; tapping one opens the full invoice
  detail view.
- **Settings** (`src/screens/SettingsScreen.tsx`) — profile, base currency,
  budget alerts, biometric lock toggle, and static preference rows.

Two full-screen/sheet overlays live outside the four tabs and can be opened
from the Dashboard: the **"Can I afford this?"** sandbox modal
(`src/modals/AffordModal.tsx`) and the **Subscriptions** bottom sheet
(`src/modals/SubscriptionsSheet.tsx`). Tapping a vault item opens
**Invoice detail** (`src/modals/InvoiceDetail.tsx`).

## Architecture

- **State**: a single React Context store (`src/store/SpendOwlContext.tsx`,
  exposed via the `useSpendOwl()` hook) holds all app state — chat messages,
  the current tab/page, recording state, expense-card edits, the afford-modal
  selection, subscriptions, vault items, and settings toggles. Screens and
  modals all read/write through this one hook, so state (e.g. a receipt
  scanned in Chat) is shared consistently across the Dashboard and Vault.
- **Mock data**: `src/store/mockData.ts` holds the seed data (demo chat
  messages, canned AI replies, the transaction list, subscriptions, vault
  items) — this is the only place to edit if you want to change the demo
  content.
- **Theme**: `src/theme.ts` has the color palette, category colors/amounts,
  and font family names.
- **Icons**: `src/icons.tsx` renders the app's icon set from raw SVG path
  data via `react-native-svg`.
- **Shared UI components** live in `src/components/` (toggle switch,
  currency pills, the animated voice waveform, the scanning laser overlay,
  the donut and trend charts, the receipt "paper" placeholder graphic, the
  header, and the bottom nav bar).
- **Root composition**: `src/RootScreen.tsx` renders the header, a
  horizontally-paged Chat/Dashboard view (swipe or tap the bottom nav to
  switch), the Vault/Settings screens, the bottom nav, and mounts the three
  modals.

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
