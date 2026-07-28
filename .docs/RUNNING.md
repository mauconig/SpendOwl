# Running SpendOwl

This is an [Expo](https://expo.dev) React Native app (TypeScript, managed
workflow). You need Node.js installed; everything else (Expo CLI) runs via
`npx` and doesn't need a separate global install.

## 1. Install dependencies

```sh
npm install
```

## 2. Set up Clerk credentials

Authentication runs on [Clerk](https://clerk.com). The app throws on boot
without a publishable key, so this step is required — it is not optional
scaffolding.

Create `.env.local` in the project root:

```env
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
```

Get the key from the Clerk Dashboard → **API keys** for the `SpendOwl`
application. The `EXPO_PUBLIC_` prefix matters: Metro only inlines env vars
with that prefix into the client bundle.

If you have the Clerk CLI installed (`npm install -g clerk`), you can pull it
instead of copying by hand:

```sh
clerk auth login
clerk init --app app_3H8ZQgGPsC4OVOPSBtZL5BANlVL
clerk env pull
```

`.env.local` is gitignored (`.env*.local`) and must stay that way. `clerk env
pull` also writes `CLERK_SECRET_KEY` — that key is unused by this client-only
app and must never be renamed to an `EXPO_PUBLIC_*` variable, which would bake
it into the shipped bundle.

Run `clerk doctor` at any point to check the CLI, the link, and the env file.

## 3. Run it

Pick whichever target you want to test on:

```sh
npm start          # opens the Expo dev-tools/QR code; pick a target from there
npm run web        # runs in a browser via react-native-web (fastest way to preview)
npm run android    # opens/builds for a connected Android device or emulator
npm run ios        # opens/builds for iOS Simulator (macOS only)
```

### On your phone (no emulator needed)

1. Install the **Expo Go** app from the Play Store / App Store.
2. Run `npm start`.
3. Scan the QR code shown in the terminal with Expo Go (Android) or the
   Camera app (iOS). The app loads over your local network — make sure your
   phone and computer are on the same Wi-Fi.

### On an Android/iOS emulator

Make sure you have an Android emulator running (via Android Studio) or the
iOS Simulator installed (via Xcode, macOS only), then run `npm run android`
or `npm run ios`. Expo will install the Expo Go equivalent build and launch
the app automatically.

### In a browser

`npm run web` is the quickest way to sanity-check a change — it uses
`react-native-web`, so it won't be pixel-identical to the native app (no
native shadows/blur in some cases), but all the screens, state, and
interactions work.

## Troubleshooting

- **"Port 8081 is being used by another process"** — either stop whatever's
  using it, or run `npx expo start --web --port <otherport>`.
- **Fonts look wrong / app looks unstyled at first launch** — the app holds
  the splash screen until the Roboto, Roboto Mono, and Noto Sans Google Fonts
  finish loading, *and* until Clerk has restored any cached session
  (`App.tsx`); this should resolve within a second on a normal connection.
- **"Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY"** — step 2 above hasn't been
  done, or the dev server was started before `.env.local` existed. Restart
  `npm start`; env files are read at server start, not on reload.
- **Stuck signed in / want a clean slate** — sign out from the Settings tab.
  The session lives in the device keychain via `expo-secure-store`, so it
  survives app restarts and reloads by design.

## Type-checking

```sh
npx tsc --noEmit
```

Authentication is real (Clerk). Everything behind it is still mocked — there
is no backend and no real AI/OCR integration, so all chat replies, receipt
scans, and voice transcriptions are simulated with fixed delays and canned
data (see `src/store/mockData.ts` and `src/store/SpendOwlContext.tsx` if you
want to change the demo content). Note that the mock data is identical for
every account: signing in as a different user shows the same fixtures.
