# Apex Cinema

Booking platform for Apex Cinema (Sri Lanka). Start with `CLAUDE.md` and `docs/` before making changes — this repo is built one explicitly-approved phase at a time.

## Prerequisites

Verified against current official docs (see `docs/PROGRESS.md` for sources/dates):

- **Node.js** `>=20.19.0` (Vite 8 and ESLint 10's minimum). This repo was built and verified on Node v26.5.0.
- **Java (JDK) 11+** — required by the Firestore/Auth emulators, not by the app itself. On macOS with Homebrew and no admin/sudo access available:
  ```sh
  brew install openjdk@21   # formula install, no sudo required
  export PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"   # add to your shell profile to make it permanent
  ```
  (The `brew install --cask temurin` alternative needs `sudo` for a system symlink step — the formula above avoids that.)
- **npm** 10+ (npm workspaces). No global installs needed — `firebase-tools` is a local devDependency, invoked via `npm run` scripts / `npx firebase`.

## Structure (npm workspaces monorepo)

```
app/                    React + Vite + TypeScript SPA (UI only)
packages/booking-core/  Pure, framework-agnostic booking/payment domain logic — no Firebase, no React
functions/              Firebase Cloud Functions (TypeScript) — the only writer of bookings/payments/roles
firebase.json, firestore.rules, .firebaserc   Firebase Hosting/Firestore/emulator config
docs/                   Planning docs — read before changing architecture or security posture
```

`app` and `functions` both depend on `packages/booking-core` (as `@apex-cinema/booking-core`) so the same tested interval-overlap/state-machine logic never has to be duplicated between the client and the server. See `docs/ARCHITECTURE.md` §13.

**Note:** `packages/booking-core` must be built (`npm run build -w packages/booking-core`) before `app` or `functions` can resolve it — the root `dev`/`build`/`test:emulators` scripts already do this for you automatically.

## Setup

```sh
npm install
```

No `.env` file is required to get started — `app/src/lib/env.ts` defaults to a `demo-apex-cinema` project id, which the Firebase Emulator Suite treats as offline-only (it will never contact a real Firebase/GCP project). Copy `app/.env.example` to `app/.env.local` only once you have a real Firebase project to point at.

## Scripts (run from the repo root)

| Script | What it does |
|---|---|
| `npm run dev` | Starts the Vite dev server. Defaults to local fixture data (`src/data/fixtures`) — set `VITE_DATA_MODE=emulator` to use the real booking engine instead (see "Real booking engine" below) |
| `npm run build` | Type-checks and builds the production bundle (`app/dist`) |
| `npm run build:functions` | Builds the Cloud Functions bundle (`functions/lib`) |
| `npm run typecheck` | `tsc --noEmit` across booking-core, app, and functions |
| `npm run lint` | ESLint across the whole repo |
| `npm run test:unit` | Vitest unit tests for booking-core and the app (no emulator needed) |
| `npm run test:e2e` | Builds the app (fixture mode), then runs Playwright against the **production build** served via `vite preview` (includes the `@smoke` tests; excludes the `@emulator` test) |
| `npm run test:e2e:emulator` | Builds the app with `VITE_DATA_MODE=emulator`, then runs the one `@emulator`-tagged Playwright test against real, seeded Auth+Firestore+Functions emulators |
| `npm run smoke` | Same as `test:e2e`, filtered to tests tagged `@smoke` |
| `npm run test:emulators` | Builds functions, seeds the catalog, then runs `firebase emulators:exec` (Auth + Firestore + Functions) wrapping the functions workspace's Vitest suite — concurrency/idempotency/expiry/validation/rules tests against the real emulators |
| `npm run seed:emulator` | Seeds `roomTiers`/`rooms`/`config/booking` from the canonical catalog into a persisted local snapshot (`./emulator-data/`, gitignored) — repeatable, refuses to run against anything but the local emulator |
| `npm run emulators` | Starts Auth+Firestore+Functions emulators (no persistence) |
| `npm run emulators:seeded` | Same, but imports `./emulator-data/` on start and re-exports on exit — use this for manual dev after running `seed:emulator` once |

All of the above only ever touch the local emulator suite or a `demo-` prefixed project. Nothing here deploys, enables billing, or contacts a real Firebase project — see `CLAUDE.md`.

## Customer UI (local fixtures)

The full customer-facing site (marketing pages + the `/book` guest booking wizard) runs entirely on typed local fixture data — see `src/data/` and `docs/DESIGN.md`. Useful URLs while developing:

- `/book?package=ac-small` (or `non-ac` / `ac-large`) — skip straight into the wizard with a package pre-selected.
- `/book?fixtureError=1` — forces the availability lookup on the date/time step to fail, to see the error state.
- The demo checkout step has a "Simulate outcome" dropdown to preview all 6 payment/booking result screens without needing a real payment flow.

## Real booking engine (local emulators)

Package retrieval, availability, and temporary checkout holds are implemented as real Cloud Functions with a transaction-safe per-room/per-date inventory design — see `docs/ARCHITECTURE.md` §5–§6 and `docs/PROGRESS.md` Phase 3. To use it instead of fixture preview data:

```sh
npm run seed:emulator                          # one-time (or whenever you want a reset)
npm run emulators:seeded                       # terminal 1
VITE_DATA_MODE=emulator npm run dev --workspace app   # terminal 2
```

The `/book` checkout step will show "Real booking engine preview" (an EMULATOR badge) instead of the fixture "Demo checkout" — a successful result is a real, temporary hold, never a confirmed paid booking (no payment/confirm step exists yet). Nothing here ever touches a real Firebase project — see `.firebaserc`'s `demo-apex-cinema` project id.

## Known limitations (intentional, not bugs)

- `firebase.json`'s Functions `predeploy` hook builds only the `functions` package; it assumes `packages/booking-core` was already built. A real deploy pipeline needs to build booking-core first — deploying is out of scope for this phase, so this is flagged rather than solved here.
- `functions/package.json` declares `engines.node: "22"` (the Cloud Functions runtime target), while local dev may run a newer Node (this repo was verified on v26.5.0). That mismatch is expected and only matters at actual deploy time.
- The mobile menu (`components/layout/Header.tsx`) doesn't implement full keyboard focus-trap cycling — Escape-to-close and initial focus are handled, but Tab doesn't loop back to the top from the last item.
- `emulators`/`emulators:seeded` scope to `--only auth,firestore,functions`, skipping the Hosting emulator — on macOS, `firebase emulators:start` with no `--only` flag can fail to bind port 5000 because Control Center's AirPlay Receiver already holds it by default. The frontend is served by Vite directly, so the Hosting emulator was never needed for this workflow anyway.
- `data/index.ts` statically imports both the fixture and Firebase-backed adapters, so the Firebase SDK is now always in the production bundle regardless of `DATA_MODE` (the `data` chunk is ~482 kB raw / ~143 kB gzip). Lazy-loading it would undo this but touches every call site currently expecting synchronous adapter exports — not done this phase, flagged in docs/PROGRESS.md.
