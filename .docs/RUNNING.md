# Running SpendOwl

SpendOwl is two pieces: an [Expo](https://expo.dev) React Native app
(TypeScript, managed workflow) and a Hono + Postgres API in `server/`. Both
need to be running.

Prerequisites:

- **Node.js 22 or newer** — the server runs TypeScript directly on Node's
  native type stripping, with no build step. Older Node cannot start it.
- **Docker Desktop** — for the Postgres container. It must be *running*, not
  just installed.
- Everything else (Expo CLI) runs via `npx`; no global install needed.

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

`clerk env pull` also writes `CLERK_SECRET_KEY`. **The API requires it** — it
is what `server/src/auth.ts` uses to verify session tokens, so the server will
refuse to start without it. It is a server-side secret: never rename it to an
`EXPO_PUBLIC_*` variable, which would bake it into the shipped app bundle
where anyone can read it.

`.env.local` is gitignored (`.env*.local`) and must stay that way. Both halves
read it — Expo loads it for the app, and the server loads it via
`node --env-file-if-exists=../.env.local`.

Run `clerk doctor` at any point to check the CLI, the link, and the env file.

## 3. Start the API and its database

The app no longer runs standalone — the Dashboard, Vault, chat history and
settings all come from the API, and it will show a "Can't load your data"
screen without it.

```sh
cd server
npm install
npm run db:up      # Postgres 17 in Docker (needs Docker Desktop running)
npm run dev        # API on :8787, applies migrations on boot
```

`db:up` starts a `spendowl-db` container with a named volume, so data survives
restarts. `npm run db:reset` destroys the volume and starts clean — the fastest
way to get freshly seeded demo data.

The API needs `CLERK_SECRET_KEY` from step 2; it reads `../.env.local`
automatically. `DATABASE_URL` defaults to the docker-compose credentials, so
you only need to set it if you point at a different database.

The server runs TypeScript directly on Node's native type stripping (Node 22+),
so there is no build step. `npm --prefix server run typecheck` checks it.

## 4. Run it

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
  using it, or run `npx expo start --web --port <otherport>`. Note that
  stopping the terminal running Metro does not always kill it; on Windows,
  `Get-NetTCPConnection -LocalPort 8081 -State Listen` finds the owning PID.
- **`EADDRINUSE ... 0.0.0.0:8787`** — an API instance is already running. Find
  and stop it (`Get-NetTCPConnection -LocalPort 8787 -State Listen` on
  Windows, `lsof -i :8787` elsewhere). Then note the gotcha: `npm run dev`
  uses `node --watch`, which does **not** retry a failed bind — it parks at
  *"Waiting for file changes before restarting"*. Freeing the port is not
  enough; save any file under `server/src/` to nudge it.
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
- **"Can't load your data"** — the app can't reach the API. The screen prints
  the URL it tried. Check `npm run dev` is running in `server/`, that Docker is
  up (`docker compose ps` in `server/`), and that the phone is on the same
  Wi-Fi as the machine. The app derives the API host from the Metro dev-server
  address, so a VPN or a guest network that isolates clients will break it;
  set `EXPO_PUBLIC_API_URL` to override.
- **Dashboard shows zeroes** — the account exists but seeding didn't run.
  Check the API log for an error on the first authenticated request.
- **Checking what actually persisted** — go straight to the database rather
  than guessing from the UI:
  ```sh
  docker exec spendowl-db psql -U spendowl -d spendowl -c "SELECT * FROM credit_cards;"
  ```

## Type-checking

```sh
npx tsc --noEmit                    # the app
npm --prefix server run typecheck   # the API
```

The app's `tsconfig.json` excludes `server/`, and `metro.config.js` blocks it
from the bundler — it is a separate Node package that the app never imports.

Authentication (Clerk) and all persisted data (Postgres) are real, and scoped
per account: two users see entirely separate data. Still simulated: the AI
coach's replies, receipt scanning, and voice transcription are canned results
on fixed delays. The server *stores* them but does not generate them — see
`.docs/BACKEND.md` for what making those real involves.

New accounts are seeded with a month of demo data on first sign-in
(`server/src/seed.ts`), so the app opens populated rather than empty.
