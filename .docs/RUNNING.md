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

### The AI coach's key

The chat coach calls an LLM, so `server/` also reads:

```env
LLM_API_KEY=sk-...
```

Unlike `CLERK_SECRET_KEY` this is **not** required to boot — it gates one
endpoint, so without it the API starts normally and only `POST /api/chat`
returns a 503. Everything else keeps working.

It defaults to DeepSeek via its Anthropic-compatible endpoint. Override the
other two to point somewhere else — Anthropic proper, or a bigger DeepSeek
model — with no code change:

```env
LLM_BASE_URL=https://api.deepseek.com/anthropic   # default
LLM_MODEL=deepseek-v4-flash                       # default
```

Note there is no `EXPO_PUBLIC_` prefix on any of these: they are server-side
secrets and must never be inlined into the app bundle.

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

## Always-on deployment (VPS)

The API and its database also run 24/7 on the VPS reachable as `ssh vps`
(147.93.180.120), so the app works without a laptop serving it.

**Base URL: `https://api.147-93-180-120.sslip.io`** — set as
`EXPO_PUBLIC_API_URL` in `.env.local`, which overrides the Metro-host detection
in `src/api/client.ts`. Unset it to go back to a local server.

Layout on the box:

| Path | What |
| --- | --- |
| `/opt/spendowl/app` | the clone; deploys `git reset --hard origin/main` onto it |
| `/opt/spendowl/api.env` | `CLERK_SECRET_KEY`, `LLM_API_KEY`, `DATABASE_URL`, `PORT` — `chmod 600`, deliberately outside the checkout so deploys can't clobber it |
| `/opt/spendowl/db/` | compose file + generated Postgres password |
| `/etc/systemd/system/spendowl-api.service` | the API unit |
| `/etc/caddy/Caddyfile` | TLS termination + reverse proxy |

- **Runtime**: Node 24 (NodeSource). Node runs the TypeScript directly, same as
  locally, so deploys have no build step.
- **Service user**: the API runs as the unprivileged `spendowl` user, not root.
- **TLS**: Caddy holds a real Let's Encrypt cert for the `sslip.io` hostname
  (which resolves to the IP without any DNS setup) and auto-renews it.
- **Network**: ufw allows only 22/80/443. The API's 8787 and Postgres' 5432 are
  **not** publicly reachable — verified from off-box. Note Postgres is published
  as `127.0.0.1:5432` on purpose: Docker writes its own nat rules and *bypasses
  ufw*, so a bare `5432:5432` would have exposed it to the internet.
- **Clerk**: still the **development** instance (`sk_test_`). Fine for now, but
  dev instances cap at 100 users and Google/Apple run on Clerk's shared OAuth
  credentials. A production instance needs its own keys — see `.docs/BACKEND.md`.

Deploy after pushing to `main`:

```sh
ssh vps spendowl-deploy
```

That fetches, resets to `origin/main`, reinstalls server deps, fixes ownership,
restarts the unit, and curls `/api/health` — exiting non-zero and printing the
journal if the service fails to come back.

Operating it:

```sh
ssh vps 'systemctl status spendowl-api'
ssh vps 'journalctl -u spendowl-api -f'         # live logs
ssh vps 'docker exec spendowl-db psql -U spendowl -d spendowl -c "SELECT count(*) FROM transactions;"'
```

Everything (`docker`, `caddy`, `spendowl-api`, and the `spendowl-db` container)
is enabled at boot, so a reboot brings the whole stack back unattended.

The box also hosts an unrelated `maubot` stack (a neo4j container plus
`maubot.service`). SpendOwl uses its own container, volume, ports and systemd
unit, and does not touch it.

## Shipping an Android build

Builds run on [EAS](https://docs.expo.dev/build/introduction/), not locally —
a local build would need the Android SDK and JDK 17, neither of which this
project otherwise requires. `eas.json` holds two profiles:

```sh
npx eas-cli build --platform android --profile preview      # APK, sideloadable
npx eas-cli build --platform android --profile production   # AAB, for Play
```

`preview` produces an **APK** you can download and install straight onto a
phone; it is how you check the standalone build before it goes anywhere.
`production` produces an **AAB**, which Play requires and which cannot be
installed directly. `autoIncrement` bumps `android.versionCode` in `app.json`
on every production build, because Play rejects a re-used version code.

Always run `npx expo-doctor` before a build. Expo Go bundles many native
modules whether or not you declared them, so a missing peer dependency is
invisible in development and crashes only in a standalone build — which is
exactly what it caught here (`expo-audio` needs `expo-asset`).

### `.npmrc` and the npm version gap

EAS installs with **npm 10**; a current local Node ships **npm 11**. They
disagree about one thing that matters here, and the disagreement is invisible
locally: `@clerk/react` asks for a `react-dom` peer that Expo SDK 54's pinned
`19.1.0` does not satisfy. npm 11 warns and continues. npm 10 tries to
auto-install a version that does satisfy it, finds no lockfile entry, and fails
`npm ci` — a build that cannot succeed on retry.

`legacy-peer-deps=true` in `.npmrc` makes both behave the same. Do not remove
it to "clean up" a peer warning: the resolution npm 10 wants would put a second
copy of React in the bundle, which breaks every hook — and only in the
standalone build, never in Expo Go.

You can reproduce an EAS install locally in about a minute rather than waiting
out the build queue:

```sh
npx -y npm@10.8.2 ci
```

### Why the env vars are duplicated in `eas.json`

`.env.local` is gitignored, and EAS uploads the project **through git**. The
file therefore never reaches the build server, and without it
`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` is undefined and `App.tsx` throws on the
first frame, while `EXPO_PUBLIC_API_URL` falls back to `localhost:8787` —
which on a phone means the phone itself. A build that boots to a crash or to
"Can't load your data" is the default outcome if you skip this.

So both are declared in each build profile's `env` block. Only these two
belong there:

- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` is *publishable* — Clerk designs it to be
  public and it is already readable in any shipped bundle.
- `EXPO_PUBLIC_API_URL` is just a hostname.

**Never add `CLERK_SECRET_KEY`, `LLM_API_KEY` or `STT_API_KEY` here.** They are
server-side secrets, `eas.json` is committed, and anything with an
`EXPO_PUBLIC_` prefix is inlined into the bundle for anyone to read. The server
reads those from `/opt/spendowl/api.env` on the VPS.

### Before a real public release

The app still points at the Clerk **development** instance (`pk_test_`), which
caps at 100 users and signs in through Clerk's shared Google/Apple OAuth
credentials. A production instance needs its own keys, its own OAuth apps, and
the `spendowl://` redirect allowed for the standalone scheme — the redirect
differs from the `exp://` one Expo Go uses, so SSO is worth re-testing on the
APK specifically. Swap `pk_live_` into `eas.json` and `sk_live_` into the VPS
env at the same time; the two halves must match instances.

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
