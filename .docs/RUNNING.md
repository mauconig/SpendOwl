# Running SpendOwl

This is an [Expo](https://expo.dev) React Native app (TypeScript, managed
workflow). You need Node.js installed; everything else (Expo CLI) runs via
`npx` and doesn't need a separate global install.

## 1. Install dependencies

```sh
npm install
```

## 2. Run it

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
  the splash screen until the Roboto/Roboto Mono Google Fonts finish
  loading (`App.tsx`); this should resolve within a second on a normal
  connection.

## Type-checking

```sh
npx tsc --noEmit
```

There is no backend and no real AI/OCR integration — all chat replies,
receipt scans, and voice transcriptions are simulated with fixed delays and
canned data (see `src/store/mockData.ts` and `src/store/SpendOwlContext.tsx`
if you want to change the demo content).
