# Apex Cinema

Booking platform for **Apex Cinema** — a private cinema and gaming-room business in Kurunegala, Sri Lanka. Customers book a whole room for a 3-hour session; staff and owner manage the day's schedule from a separate, role-protected area.

This repository is built one explicitly-approved phase at a time. Read [`CLAUDE.md`](CLAUDE.md) and [`docs/PROGRESS.md`](docs/PROGRESS.md) before changing anything.

> **Everything in this guide runs on your own machine against the Firebase Emulator Suite.** Nothing here deploys the site, contacts a real Firebase project, takes a real payment, or makes the site publicly reachable. See [Current limitations and deployment status](#13-current-limitations-and-deployment-status).

---

## Table of contents

1. [Project overview and current capabilities](#1-project-overview-and-current-capabilities)
2. [Architecture and folder structure](#2-architecture-and-folder-structure)
3. [Prerequisites](#3-prerequisites)
4. [First-time local setup](#4-first-time-local-setup)
5. [Daily startup and shutdown](#5-daily-startup-and-shutdown)
6. [URLs, ports, and local accounts](#6-urls-ports-and-local-accounts)
7. [Practical walkthroughs](#7-practical-walkthroughs)
8. [Complete command reference](#8-complete-command-reference)
9. [Testing safely](#9-testing-safely)
10. [Troubleshooting](#10-troubleshooting)
11. [Data, configuration, and secrets](#11-data-configuration-and-secrets)
12. [Git workflow](#12-git-workflow)
13. [Current limitations and deployment status](#13-current-limitations-and-deployment-status)

---

## 1. Project overview and current capabilities

### The business, in one paragraph

Apex Cinema rents out six private rooms. Rooms 1–5 are bookable online for a fixed 3-hour session; room 6 is the Party room, which is **arranged by phone only** and never appears as a bookable option. Customers do not create accounts (guest checkout). Staff and owner sign in with real accounts whose roles are enforced by the server.

### Packages and prices

These come from `packages/booking-core/src/packageCatalog.ts` and are the single source of truth. The client can never change a price — every amount is recomputed server-side.

| Package | Price | Capacity | Rooms | Bookable online? |
|---|---|---|---|---|
| Non-AC | LKR 2,300 | up to 3 people | Rooms 1–3 | Yes |
| AC Small | LKR 3,200 | up to 3 people | Room 4 | Yes |
| AC Large | LKR 4,500 | up to 5 people | Room 5 | Yes |
| Party | LKR 12,500 | up to 12 people | Room 6 | **No — contact only** |

**Session rules** (`packages/booking-core/src/businessRules.ts`): opening 09:00, closing 21:00, sessions are 180 minutes, and the four public start times are **09:00, 12:00, 15:00, 18:00** (Asia/Colombo). A customer never picks a room number — the server assigns one within the chosen package.

### The LKR 1,000 advance policy

`ADVANCE_AMOUNT_LKR = 1000`. Every booking requires an **LKR 1,000 advance before it is confirmed**. This amount **counts toward the package total — it is not an extra fee**.

Worked example (AC Small): total **LKR 3,200** → advance **LKR 1,000** → balance **LKR 2,200**.

This policy is decided and implemented for **manual (staff-entered) bookings**. It is *displayed* to customers on the online review step, but **the online flow cannot collect it yet** — see the honest split below.

### What is actually implemented today

| Capability | Status | Notes |
|---|---|---|
| Marketing pages (Home, Packages, Rooms, Party, FAQ, Policies, Contact) | ✅ Implemented | Bilingual English / Sinhala |
| Customer booking wizard (`/book`) | ✅ Implemented | Package → date/time → details → review → checkout |
| Temporary room hold | ✅ Implemented | `createHold` Cloud Function, transaction-safe, expires after **10 minutes** |
| Online payment collection | ❌ **Not implemented** | No PayHere, no card/bank flow. A customer flow ends at a *hold*, never a confirmed paid booking |
| Staff / owner login with server-enforced roles | ✅ Implemented | Custom claims, `/staff/login` |
| Daily schedule view | ✅ Implemented | `/staff`, rooms grouped, status + payment badges |
| Manual booking (phone / walk-in) | ✅ Implemented | `/staff/new-booking`, requires confirming the LKR 1,000 cash advance |
| Recording cash payments | ✅ Implemented | Records cash **already received in person**. Does not charge anyone |
| One-hour extension | ✅ Implemented | `EXTENSION_MINUTES = 60`, `EXTENSION_FEE_LKR = 1000`, subject to availability and the 21:00 close |
| Cancellation | ✅ Implemented, deliberately narrow | Manual bookings only, only while **no payment has been recorded**, only before the session starts, never Party |
| Refunds | ❌ **Not implemented** | No refund policy exists yet, so a paid booking simply cannot be cancelled in the UI |
| Owner overview | ✅ Implemented | `/staff/overview` — **booking/hold counts only**, never revenue |
| Party booking management | ❌ **Not implemented** | Room 6 shows a "contact-only" note in the schedule; there is no Party entry screen |
| Email / SMS / WhatsApp notifications | ❌ **Not implemented** | No notification code exists anywhere in the repo |
| Public deployment | ❌ **Not done** | Running locally does not publish the site |

### Cash payment recording vs. actual payment collection

This distinction matters and the UI is deliberate about it:

- **Recording a cash payment** = a staff member received physical cash from a customer and is writing that fact into the ledger. The app moves no money.
- **Collecting a payment** = charging a card or bank account online. **This does not exist in this codebase.**

Writing "paid" in a staff note does **not** record a payment. Only the **Record payment** dialog (or ticking the advance checkbox when creating a manual booking) writes to the payment ledger.

### The three ways to run the app

| Mode | How you start it | What the data is | What writes happen |
|---|---|---|---|
| **Fixture / demo mode** (default) | `npm run dev` | Hard-coded local sample data in `app/src/data/fixtures` | **None.** Nothing is stored. The checkout step is a simulated preview with a "Simulate outcome" dropdown |
| **Local emulator mode** | Emulators + `VITE_DATA_MODE=emulator` | The real Cloud Functions + Firestore, running on your machine | **Real writes to your local emulator.** Holds, bookings, and payments are genuinely created |
| **Production deployment** | *Not available* | — | Out of scope; no deploy pipeline is documented here |

---

## 2. Architecture and folder structure

```
apex-cinema/
├── app/                      React + Vite + TypeScript single-page app (the browser UI)
│   ├── src/                  Source: routes, components, i18n, data adapters
│   ├── e2e/                  Playwright browser tests (*.spec.ts)
│   ├── .env.example          Template for local environment variables
│   ├── playwright.config.ts       Browser tests against the PRODUCTION build
│   └── playwright.dev.config.ts   Browser tests against a real `vite dev` server
├── functions/                Firebase Cloud Functions (TypeScript) — the ONLY writer of
│   ├── src/                  bookings, payments, roles, and the audit log
│   │   └── scripts/          Seed scripts (rooms/packages/config, and test accounts)
│   └── tests/                Backend tests that run against the emulators
├── packages/booking-core/    Pure booking/payment domain logic — no Firebase, no React.
│                             Shared by BOTH app and functions so the rules can never drift
├── scripts/                  Bash runners for the two isolated browser-test suites
├── docs/                     Project documentation (read these before architectural changes)
├── firebase.json             Emulator/Hosting/Firestore config for normal local development
├── firebase.test.json        Separate config for ISOLATED test runs (different ports + project)
├── firestore.rules           Firestore security rules (default-deny)
└── emulator-data/            Your saved local emulator data (gitignored, never committed)
```

### How the pieces talk to each other

```
   Browser (app/)
        │
        │  1. Calls a Cloud Function (never writes to Firestore directly)
        ▼
   Cloud Functions (functions/)  ──uses──►  booking-core  ◄──uses──  app/
        │                                   (shared rules)
        │  2. Validates the request, recomputes every amount server-side,
        │     then writes inside a transaction
        ▼
   Firestore  ◄── guarded by firestore.rules (default-deny; client writes are not trusted)

   Firebase Auth ──► issues the signed-in user's role as a custom claim,
                     which Cloud Functions check on every staff/owner call
```

The key rule (`CLAUDE.md` #5): **the server is the only source of truth**. The browser never sets a price, a role, a payment status, or a room assignment.

`packages/booking-core` exists so the interval-overlap maths, the state machines, and the price constants are written once and used by both sides. **It must be compiled before `app` or `functions` can resolve it** — the root `dev`, `build`, `emulators`, and `seed` scripts all do this automatically.

Documentation map:

| File | What it covers |
|---|---|
| [`docs/PROJECT_BRIEF.md`](docs/PROJECT_BRIEF.md) | Product spec |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Data model, collections, transaction design |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Security model and threat assumptions |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Decision log + **open business questions** |
| [`docs/DESIGN.md`](docs/DESIGN.md) | Design tokens, contrast measurements, localisation |
| [`docs/PROGRESS.md`](docs/PROGRESS.md) | Phase-by-phase history and **dated verification results** |

---

## 3. Prerequisites

### What you need

| Tool | Required version | Why |
|---|---|---|
| **Node.js** | **22** recommended | `functions/package.json` targets Node **22** (the Cloud Functions runtime). The repo root allows `>=20.19.0` |
| **npm** | 10 or newer | Uses npm workspaces |
| **Java (JDK)** | **11 or newer** (JDK 21 is what this repo uses) | Required by the **Firestore and Auth emulators**. Not used by the app itself |
| **Git** | Any recent version | Cloning and branching |
| **Firebase CLI** | *Nothing to install* | `firebase-tools` is already a local dev dependency. Use `npx firebase` or the `npm run` scripts |

### Check what you already have

Run these from anywhere:

```sh
node -v      # want v22.x (v20.19+ works for the app; v22 matches the Functions target)
npm -v       # want 10 or newer
java -version   # want 11 or newer — prints to stderr, that's normal
git --version
```

If `java -version` prints `command not found`, see the next section.

### macOS: selecting a runtime **for one terminal only**

On macOS it is common to have a newer default Node than this project targets, and to have Java installed but not linked onto `PATH`. **You do not need to change your global tooling.** Prefix your `PATH` in the terminal you're working in — the change disappears when you close that terminal.

Homebrew's location differs by chip:

| Mac type | Homebrew prefix |
|---|---|
| Apple Silicon (M1/M2/M3/M4) | `/opt/homebrew` |
| Intel | `/usr/local` |

Check which you have with `brew --prefix` (or `uname -m` → `arm64` means Apple Silicon).

**Apple Silicon** — run once per terminal, before the project commands:

```sh
export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/opt/openjdk@21/bin:$PATH"
node -v && java -version
```

**Intel** — same idea, different prefix:

```sh
export PATH="/usr/local/opt/node@22/bin:/usr/local/opt/openjdk@21/bin:$PATH"
node -v && java -version
```

If those formulas are not installed yet:

```sh
brew install node@22
brew install openjdk@21     # formula install — no sudo required
```

> Use the `openjdk@21` **formula**, not `brew install --cask temurin`. The cask needs `sudo` for a system symlink step; the formula does not.

**Good news about Java and the test scripts:** `scripts/test-e2e-emulator-isolated.sh` and `scripts/test-e2e-devmode-isolated.sh` already check for a working `java` and, if it's missing, add `/opt/homebrew/opt/openjdk@21/bin` to `PATH` **for that script's own subprocess only**. They never modify your global environment. If Java still can't be found, they stop with a clear message instead of failing confusingly.

To make the `PATH` change permanent you may add the `export` line to `~/.zshrc`. That is your choice — this guide does not require it, and none of the project commands change global tooling.

---

## 4. First-time local setup

Follow these in order. **Every step says which directory to run it from.** Steps 7 and 8 need two terminals that stay open.

### Step 1 — Clone the repository and enter it

*Working directory: wherever you keep your projects (e.g. `~/Projects`)*

```sh
git clone https://github.com/Madushan186/apex-cinema.git
cd apex-cinema
```

Everything after this runs from the repository root (`~/Projects/apex-cinema`) unless stated otherwise.

### Step 2 — Select the runtime for this terminal

*Working directory: `~/Projects/apex-cinema`*

```sh
export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/opt/openjdk@21/bin:$PATH"
node -v && java -version
```

Use `/usr/local/...` instead of `/opt/homebrew/...` on an Intel Mac. Repeat this line in every new terminal you open for this project.

**Expected:** `v22.x.x`, then an `openjdk version "21..."` line.

### Step 3 — Install dependencies from the lockfile

*Working directory: `~/Projects/apex-cinema`*

```sh
npm ci
```

`npm ci` installs the **exact** versions recorded in `package-lock.json` and is the right command for a fresh clone. (Use `npm install` only when you are deliberately adding or changing a dependency.) This installs all workspaces — `app`, `functions`, and `packages/booking-core` — in one go.

**Expected:** a summary line such as `added NNNN packages`, and no `ERR!` lines.

### Step 4 — Create your local environment file (optional)

*Working directory: `~/Projects/apex-cinema`*

**You can skip this step.** The app ships with safe demo defaults built in (`app/src/lib/env.ts`), so it boots against the emulators with zero configuration.

Create the file only if you want to override those defaults. This command **will not overwrite an existing file**:

```sh
cp -n app/.env.example app/.env.local
```

`cp -n` means "no clobber" — if `app/.env.local` already exists, nothing happens and your file is preserved.

#### Environment variables, and which ones reach the browser

**Every variable beginning with `VITE_` is compiled into the JavaScript bundle and is publicly visible in the browser.** That is acceptable for the values below — Firebase client config values are *identifiers*, not secrets, and access is enforced by Firestore rules and Cloud Functions. **A real secret must never be given a `VITE_` name** (`CLAUDE.md` rule 10).

| Variable | Safe example value | What it does | Reaches the browser? |
|---|---|---|---|
| `VITE_FIREBASE_API_KEY` | `demo-api-key` | Firebase client identifier | **Yes** |
| `VITE_FIREBASE_AUTH_DOMAIN` | `demo-apex-cinema.firebaseapp.com` | Firebase client identifier | **Yes** |
| `VITE_FIREBASE_PROJECT_ID` | `demo-apex-cinema` | Project id. A `demo-` prefix guarantees no real GCP project is ever contacted | **Yes** |
| `VITE_FIREBASE_STORAGE_BUCKET` | `demo-apex-cinema.appspot.com` | Firebase client identifier | **Yes** |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `000000000000` | Firebase client identifier | **Yes** |
| `VITE_FIREBASE_APP_ID` | `1:000000000000:web:0000000000000000000000` | Firebase client identifier | **Yes** |
| `VITE_USE_FIREBASE_EMULATOR` | `true` | Forces the app to use local emulators. **Defaults to `true`** so a missing file can never point at something real | **Yes** |
| `VITE_FIREBASE_EMULATOR_HOST` | `127.0.0.1` | Where the emulators are | **Yes** |
| `VITE_DATA_MODE` | `emulator` | `emulator` = real backend; anything else (or unset) = fixture/demo data. Normally passed on the command line rather than stored in the file | **Yes** |
| `VITE_FIREBASE_EMULATOR_AUTH_PORT` | `9099` | Override only for isolated test runs | **Yes** |
| `VITE_FIREBASE_EMULATOR_FIRESTORE_PORT` | `8080` | Override only for isolated test runs | **Yes** |
| `VITE_FIREBASE_EMULATOR_FUNCTIONS_PORT` | `5001` | Override only for isolated test runs | **Yes** |

Server-only variables — these are set by the seed/test tooling itself and are **never** prefixed with `VITE_`, so they never enter the bundle: `FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`, `GCLOUD_PROJECT`, and the `TEST_*` port overrides.

There is a deliberate safety check: if you set `VITE_DATA_MODE=emulator` **and** `VITE_USE_FIREBASE_EMULATOR=false`, the app refuses to start rather than risk touching a real project (`app/src/lib/firebase/client.ts`).

### Step 5 — Build the shared package and the functions

*Working directory: `~/Projects/apex-cinema`*

```sh
npm run build:functions
```

This compiles `packages/booking-core` **and then** `functions`. The order matters, and this script handles it for you.

**Expected:** the command finishes silently (TypeScript prints nothing on success) and returns you to the prompt.

### Step 6 — Seed the emulator for the first time

*Working directory: `~/Projects/apex-cinema`*

> ⚠️ **Important:** this command **starts its own temporary emulator**, runs the seeds, exports the result to `./emulator-data/`, and shuts that emulator down. **Do not have emulators already running on the default ports when you run it** — they would collide. This is a *first-time / deliberate reset* command, **not** part of your daily startup.

```sh
npm run seed:emulator
```

It writes the four package tiers, the six rooms, and the booking config, then creates the two local test accounts.

**Expected:** among the output you should see lines like:

```
Seeded 4 package tiers, 6 rooms, and config/booking into project "demo-apex-cinema" ...
Seeded owner test account: owner@apexcinema.test (uid: ...)
Seeded staff test account: staff@apexcinema.test (uid: ...)

Local emulator test credentials (development-only, never real):
  owner  owner@apexcinema.test  /  LocalOwner!123
  staff  staff@apexcinema.test  /  LocalStaff!123
```

Both seed scripts refuse to run unless they can positively confirm they are talking to a local emulator on a `demo-` prefixed project. They are safe to re-run — every write is keyed by a stable document id, so re-seeding overwrites with the same canonical data instead of duplicating anything.

### Step 7 — Start the emulators (Terminal 1)

*Working directory: `~/Projects/apex-cinema`*

Open a terminal, apply the `PATH` line from Step 2, then:

```sh
npm run emulators:seeded
```

This loads your saved data from `./emulator-data/` on start and exports it back on exit, so your bookings survive a restart.

**Expected:** a table of running emulators, followed by:

```
✔  All emulators ready! It is now safe to connect your app.
```

**Leave this terminal running.** The Emulator UI is at **http://127.0.0.1:4000**.

### Step 8 — Start the frontend in emulator mode (Terminal 2)

*Working directory: `~/Projects/apex-cinema`*

Open a **second** terminal, apply the `PATH` line from Step 2, then:

```sh
VITE_DATA_MODE=emulator npm run dev --workspace app
```

**Expected:**

```
  VITE v8.x.x  ready in NNN ms

  ➜  Local:   http://localhost:5173/
```

**Leave this terminal running too.**

### Step 9 — Open the site and verify it works

Open **http://localhost:5173** in your browser.

Check all of the following:

1. The home page loads with the Apex Cinema logo and a dark theme.
2. Go to **http://localhost:5173/book** — you should see three selectable packages with prices LKR 4,500 / LKR 3,200 / LKR 2,300.
3. Click **Continue**, and on the date/time step you should see real availability such as *"1 of 1 rooms free"* under a time slot. **This proves you are on the real backend, not fixtures.**
4. Go to **http://localhost:5173/staff/login** and sign in as `staff@apexcinema.test` / `LocalStaff!123`. You should land on *Today's Schedule* listing Rooms 1–6.

If step 3 shows no availability at all, it may simply be late in the day — see [Troubleshooting](#no-selectable-time-slots-late-in-the-day). If step 4 fails, see [Missing emulator auth accounts](#login-fails--no-such-account).

---

## 5. Daily startup and shutdown

Once you've done the first-time setup, your daily routine is short. **Do not re-run `npm run seed:emulator`** — that is a reset command and it would also collide with running emulators.

### Starting up

**Terminal 1 — Firebase emulators**

*Working directory: `~/Projects/apex-cinema`*

```sh
export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/opt/openjdk@21/bin:$PATH"
npm run emulators:seeded
```

Wait for `✔  All emulators ready!` before moving on.

**Terminal 2 — Frontend**

*Working directory: `~/Projects/apex-cinema`*

```sh
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
VITE_DATA_MODE=emulator npm run dev --workspace app
```

Wait for the `Local: http://localhost:5173/` line, then open that URL.

**Terminal 3 — Optional checks** *(open only when you need it)*

*Working directory: `~/Projects/apex-cinema`*

```sh
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
npm run typecheck
npm run lint
npm run test:unit
```

These three are read-only: they start no servers and write no data, so they are safe to run while Terminals 1 and 2 are live.

### Shutting down

Shut down **in this order** so your data is saved correctly:

1. **Terminal 2 (frontend):** press `Ctrl+C`. It stops immediately; it stores nothing.
2. **Terminal 1 (emulators):** press `Ctrl+C` **once**, then **wait**.

Because you started with `emulators:seeded`, the emulator exports everything to `./emulator-data/` on the way out. You'll see lines such as `Exporting data to: ./emulator-data` followed by `Export complete`. **Do not press `Ctrl+C` a second time and do not close the terminal window while it is exporting** — that is how local data gets lost.

### How your local data is preserved

| Command | Loads existing data? | Saves on exit? |
|---|---|---|
| `npm run emulators:seeded` | Yes, from `./emulator-data/` | **Yes**, back to `./emulator-data/` |
| `npm run emulators` | No — starts empty | **No** — everything is discarded |
| `npm run seed:emulator` | No — starts its own emulator | Yes, exports to `./emulator-data/` |

For day-to-day work you almost always want **`emulators:seeded`**.

`emulator-data/` is gitignored and must never be committed.

---

## 6. URLs, ports, and local accounts

### Ports used by normal development (`firebase.json`)

| Port | Service | URL | Notes |
|---|---|---|---|
| **5173** | Vite dev server (the website) | http://localhost:5173 | Vite's default |
| **4000** | Firebase Emulator UI | http://127.0.0.1:4000 | Inspect Firestore documents and Auth users |
| **9099** | Auth emulator | — | Used by the app, not browsed directly |
| **8080** | Firestore emulator | — | Used by the app, not browsed directly |
| **5001** | Cloud Functions emulator | — | Used by the app, not browsed directly |
| 5000 | Hosting emulator | — | **Configured but deliberately not started.** The `--only auth,firestore,functions` flag skips it, because on macOS port 5000 is usually taken by AirPlay Receiver. Vite serves the site instead |

### Ports used by isolated test runs (`firebase.test.json`)

These exist so tests can never touch your live preview data. Project id: **`demo-apex-cinema-test`** (different from your preview's `demo-apex-cinema`).

| Port | Service |
|---|---|
| **9199** | Auth emulator (isolated) |
| **8180** | Firestore emulator (isolated) |
| **5101** | Cloud Functions emulator (isolated) |
| 4401 | Emulator hub |
| 4501 | Logging |
| 9301 | Eventarc |
| 9501 | Tasks |
| — | Emulator UI is **disabled** for isolated runs |

### Ports used by browser test suites

| Port | Suite |
|---|---|
| **4173** | Playwright against the **production build** (`vite preview`, `playwright.config.ts`) |
| **5183** | Playwright against a **real `vite dev` server** (`playwright.dev.config.ts`) — deliberately *not* 5173 so it can never collide with, or write into, your live preview |

### Application routes

| Route | Page | Access |
|---|---|---|
| `/` | Home | Public |
| `/packages` | Packages and prices | Public |
| `/rooms` | Rooms | Public |
| `/party` | Party information (contact-only) | Public |
| `/faq` | FAQ | Public |
| `/policies` | Policies | Public |
| `/contact` | Contact | Public |
| `/book` | Booking wizard | Public |
| `/staff/login` | Staff / owner sign-in | Public |
| `/staff` | Today's schedule | Staff **and** owner |
| `/staff/new-booking` | Manual booking form | Staff **and** owner |
| `/staff/overview` | Booking counts | **Owner only** |

Handy development links:

- `http://localhost:5173/book?package=ac-small` — jump straight into the wizard with a package pre-selected (`non-ac`, `ac-small`, `ac-large`).
- `http://localhost:5173/book?fixtureError=1` — **fixture mode only**; forces the availability lookup to fail so you can see the error state.

### Local test accounts (emulator only)

These come from `functions/src/scripts/seedAuthUsers.ts` and are created by `npm run seed:emulator`.

| Role | Email | Password |
|---|---|---|
| Owner | `owner@apexcinema.test` | `LocalOwner!123` |
| Staff | `staff@apexcinema.test` | `LocalStaff!123` |

> **These are development-only credentials for your local Auth emulator.** They are not real accounts, they exist only on your machine, and they grant no access to anything outside it. Never reuse these values anywhere real.

**Owner** sees everything Staff sees, plus `/staff/overview`. **Staff** visiting `/staff/overview` directly gets *"Access denied"* — the role is checked on the server, not hidden in the UI.

### How accounts are created, and what to do if login is missing

Accounts are **not** created through any UI — there is no sign-up page, by design. The only thing that ever grants a role is the seed script, run manually against your local emulator.

If sign-in fails with "no such account", you only need to **re-seed the accounts** — you do **not** need to wipe your bookings:

*Working directory: `~/Projects/apex-cinema`*

```sh
# Terminal 1 keeps running `npm run emulators:seeded`.
# In a separate terminal:
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
export FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"
export GCLOUD_PROJECT="demo-apex-cinema"
npm run seed:auth --workspace functions
```

This talks to the **already-running** emulator and only touches Auth users. The script is safe to re-run: it looks each account up by email and updates it in place.

> Do **not** reach for `npm run seed:emulator` to fix a login problem — that starts a separate emulator and is a data-reset path.

---

## 7. Practical walkthroughs

> ⚠️ **These walkthroughs write real data into whichever emulator you are pointed at.** Holds, bookings, and payment records will appear in your schedule and be exported to `./emulator-data/` when you shut down. Use the fictional details below, never a real person's information.

Fictional test details used throughout:

- Name: **Nimal Perera**
- Phone: **0771234567**
- Email: **nimal.perera@example.com**

### 7.1 Customer booking → temporary hold

1. Open **http://localhost:5173/book**.
2. **Step 1 – Package:** choose **AC Small (LKR 3,200)**, click **Continue**.
3. **Step 2 – Date & time:** pick a date, then a slot showing *Available*. Fully-booked slots are shown but not selectable. Click **Continue**.
4. **Step 3 – Your details:** enter the fictional name, phone, email, and `3` people (AC Small holds up to 3). Click **Continue**.
5. **Step 4 – Review:** confirm the money breakdown reads
   - Total **LKR 3,200**
   - Advance to confirm **LKR 1,000**
   - Balance due at your session **LKR 2,200**
6. Click **Continue to demo checkout**.
7. **Step 5 – Checkout:** you'll see an **EMULATOR** badge and *"Real booking engine preview"*. Click **Create hold (local emulator)**.
8. You get a **hold reference** like `APX-XXXXXXXXXXXX` and a countdown.

**What just happened, precisely:** a room was atomically reserved for **10 minutes**. That is all.

**Current payment limitation:** the customer flow **stops here**. No money was requested, no card was charged, and the booking is *not* confirmed. There is no online path to pay the LKR 1,000 advance — the review screen says so explicitly. Converting a hold into a confirmed booking currently requires a staff member.

### 7.2 Staff and owner login

1. Go to **http://localhost:5173/staff/login**.
2. Sign in as **staff** (`staff@apexcinema.test` / `LocalStaff!123`).
3. You land on **Today's Schedule**, with a top bar reading *"Signed in as staff@apexcinema.test — Staff"*.
4. Try **http://localhost:5173/staff/overview** directly → **"Access denied"**.
5. **Sign Out**, then sign in as **owner** (`owner@apexcinema.test` / `LocalOwner!123`). The same overview link now works.

### 7.3 Manual booking with the required advance

*This is the only path that produces a confirmed booking.*

1. Signed in as staff or owner, click **+ New manual booking** (or go to `/staff/new-booking`).
2. **Session** section: choose **Non-AC (LKR 2,300)**, pick a date and an available start time.
3. **Customer** section: `2` people, name **Nimal Perera**, phone **0771234567**. Email is optional.
4. **Booking details** section: choose **Walk-in** or **Phone**. The staff note is optional and visible to staff only.
5. Click **Review booking**. You'll see:
   - Total **LKR 2,300**
   - Cash advance to record now **LKR 1,000**
   - Balance due after advance **LKR 1,300**
6. Tick **"I confirm the LKR 1,000 cash advance has been received from the customer."**

   > **Only tick this if cash has genuinely changed hands.** Ticking it writes a payment record. The app collects nothing — it records what you already received.

7. Click **Confirm booking**.
8. The success screen shows the reference, the assigned room, **Advance recorded LKR 1,000**, **Balance due LKR 1,300**, and payment status **Partially paid**.

If you don't tick the box, the form will not let you confirm — the advance is mandatory before a booking is confirmed.

### 7.4 Navigating the schedule

On **`/staff`**:

- Bookings are grouped under **Room 1 … Room 6**, each row showing the time range, package, customer, people count, and reference.
- **Room 6 (Party)** always shows *"Contact-only — party bookings are arranged by phone, not shown here."* There is no Party booking screen.
- Use **‹** / **›** beside the date to move between days.
- **Badges** carry both an icon and a text label, so status is never communicated by colour alone: *Active hold*, *Confirmed*, *Cancelled*, *Unpaid*, *Partially paid · Balance due LKR …*, *Paid*.
- Action buttons appear **only when the action is actually permitted**. **Cancel booking** is visually separated from the routine actions by a divider and red styling, so it is never clicked by accident.

### 7.5 Recording the remaining cash payment

1. Find your manual booking and click **Record payment**.
2. The dialog shows **Total due**, **Already paid** (green), and **Remaining balance**, with the amount field pre-filled to the full remaining balance.
3. Adjust the amount if the customer paid only part of it, then confirm.
4. The row's badge updates. Once the balance reaches zero it reads **Paid**.

The server rejects an amount that would overpay the balance, and rejects zero, negative, and non-integer amounts.

### 7.6 Extensions and their effect on the money

1. On an eligible booking, click **Extend +1 hour**.
2. The dialog shows the current end time, the new end time, an **Additional charge of LKR 1,000**, and the **New total**.
3. Confirm.

**What changes and what doesn't:**

- **Total** increases by LKR 1,000.
- **Balance** increases by LKR 1,000.
- **Amount already paid never changes** — an extension adds a charge, it does not collect money.
- A fully-paid booking that gets extended correctly drops back to **Partially paid**.

Extension is blocked when the new end time would pass the 21:00 close, when the session has already ended, and always for Party.

### 7.7 Worked example (verified against current prices)

AC Small, one extension, paid off in two instalments:

| Step | Total | Paid | Balance | Status |
|---|---|---|---|---|
| Manual booking created, advance ticked | 3,200 | 1,000 | **2,200** | Partially paid |
| **+1 hour extension** (LKR 1,000) | **4,200** | 1,000 | **3,200** | Partially paid |
| Record payment of LKR 3,200 | 4,200 | 4,200 | **0** | **Paid** |

Note how the extension raised the total and the balance but left *paid* untouched.

### 7.8 Cancellation eligibility and preserved history

**Cancel booking** appears **only** when every one of these is true:

- the booking is **confirmed** (not a hold), **and**
- it was created manually by staff (walk-in or phone), **and**
- **no payment has ever been recorded against it**, **and**
- the session has **not started yet**, **and**
- it is **not** the Party room.

**A consequence worth understanding:** because every manual booking now requires the LKR 1,000 advance, a booking you just created through the UI **already has a recorded payment and therefore cannot be cancelled**. That is intentional, not a bug — there is **no refund policy and no refund mechanism**, so the system refuses to make money silently disappear. Only older bookings created before that policy remain cancellable.

When a cancellation does go through, the booking is **not deleted**. Its status changes to *Cancelled*, the room/time is released for rebooking, and the record plus its audit trail remain visible.

### 7.9 Owner overview

Sign in as owner and open **`/staff/overview`**.

This shows **counts only** — how many bookings and holds exist for a date. It deliberately shows **no revenue, no payment records, and no customer personal details**.

---

## 8. Complete command reference

All commands run from the repository root (`~/Projects/apex-cinema`) unless the table says otherwise. Apply the `PATH` line from [Step 2](#step-2--select-the-runtime-for-this-terminal) first in any new terminal.

### Development and builds

| Purpose | Command | Directory | Prerequisites | Starts a server? | Writes data? | Needs free ports |
|---|---|---|---|---|---|---|
| Dev server, **fixture/demo data** | `npm run dev` | root | `npm ci` | **Yes** (blocks terminal) | No | 5173 |
| Dev server, **real backend** | `VITE_DATA_MODE=emulator npm run dev --workspace app` | root | Emulators already running | **Yes** (blocks terminal) | Via the app, yes | 5173 |
| Build the frontend for production | `npm run build` | root | `npm ci` | No | No (writes `app/dist`) | — |
| Build the Cloud Functions | `npm run build:functions` | root | `npm ci` | No | No (writes `functions/lib`) | — |
| Preview an existing production build | `npm run preview` | root | `npm run build` first | **Yes** | No | 4173 |

`npm run dev`, `npm run build`, `build:functions`, `emulators*`, and `seed:emulator` all compile `packages/booking-core` first — you never need to build it by hand.

### Emulators and seeding

| Purpose | Command | Directory | Prerequisites | Starts a server? | Writes data? | Needs free ports |
|---|---|---|---|---|---|---|
| **Daily**: start emulators, load + save your data | `npm run emulators:seeded` | root | Java; seeded once | **Yes** (blocks terminal) | Saves to `emulator-data/` on exit | 9099, 8080, 5001, 4000 |
| Start emulators with **no persistence** | `npm run emulators` | root | Java | **Yes** (blocks terminal) | **Discards everything on exit** | 9099, 8080, 5001, 4000 |
| **First-time / reset**: seed rooms, config, accounts | `npm run seed:emulator` | root | Java; **no emulators running** | Starts and stops its own | **Yes** — writes `emulator-data/` | 9099, 8080, 5001 |
| Re-create only the test accounts | `npm run seed:auth --workspace functions` | root | Emulators **already running**; `FIREBASE_AUTH_EMULATOR_HOST` + `GCLOUD_PROJECT` exported (see [§6](#how-accounts-are-created-and-what-to-do-if-login-is-missing)) | No | Yes — Auth users only | — |

### Checks and tests

| Purpose | Command | Directory | Prerequisites | Starts a server? | Writes data? | Needs free ports |
|---|---|---|---|---|---|---|
| Type-check everything | `npm run typecheck` | root | `npm ci` | No | No | — |
| Lint everything | `npm run lint` | root | `npm ci` | No | No | — |
| Unit tests (booking-core + app) | `npm run test:unit` | root | `npm ci` | No | No | — |
| Browser tests, **production build**, fixture data | `npm run test:e2e` | root | `npm ci` | Yes, manages its own | No | 4173 |
| Just the smoke subset of the above | `npm run smoke` | root | `npm ci` | Yes, manages its own | No | 4173 |
| Browser tests, **isolated emulator** | `npm run test:e2e:emulator` | root | Java | Yes, manages its own | Yes — **isolated** instance only | 9199, 8180, 5101, 4173 |
| Browser tests, **real `vite dev`**, isolated | `npm run test:e2e:devmode` | root | Java | Yes, manages its own | Yes — **isolated** instance only | 9199, 8180, 5101, **5183** |
| Backend + Firestore rules tests | `npm run test:emulators` | root | Java; **no emulators running** | Starts and stops its own | Yes — **default ports/project** ⚠️ | 9099, 8080, 5001 |

⚠️ **`npm run test:emulators` is not isolated.** It uses `firebase.json`'s default ports and the default `demo-apex-cinema` project, exactly like your live preview. See [Testing safely](#9-testing-safely).

---

## 9. Testing safely

The single most important question is: **can I run this while my preview emulators are running?**

| Command | Safe alongside your running preview? | Why |
|---|---|---|
| `npm run typecheck` | ✅ Yes | Reads files only |
| `npm run lint` | ✅ Yes | Reads files only |
| `npm run test:unit` | ✅ Yes | Pure functions and jsdom; no network, no emulator |
| `npm run test:e2e` / `npm run smoke` | ✅ Yes | Serves a production build on **4173**; uses fixture data, touches no emulator |
| `npm run test:e2e:emulator` | ✅ Yes | Fully isolated — separate project **and** separate ports |
| `npm run test:e2e:devmode` | ✅ Yes | Fully isolated, and uses port **5183** so it can never hit your 5173 preview |
| `npm run seed:emulator` | ❌ **No** | Starts its own emulator on the **default** ports → port conflict, and it rewrites `emulator-data/` |
| `npm run test:emulators` | ❌ **No** | Uses the **default** ports and the **default** project id |

### How the isolated suites protect your data

`scripts/test-e2e-emulator-isolated.sh` and `scripts/test-e2e-devmode-isolated.sh` both:

1. **Use a different project id** — `demo-apex-cinema-test`, never `demo-apex-cinema`. This matters more than ports: the Firebase emulator hub coordinates instances **by project id**, so two runs sharing a project id can silently reach each other's emulators even on different ports.
2. **Use different ports** — Auth **9199**, Firestore **8180**, Functions **5101** (from `firebase.test.json`).
3. **Check for Java**, adding `/opt/homebrew/opt/openjdk@21/bin` to the script's own subprocess `PATH` if needed, and stopping with a clear message if no working `java` is found.
4. **Start their own emulator in the background** and poll its log for `All emulators ready` before continuing. (`firebase emulators:exec` was found unreliable for a *second*, isolated instance in this environment — see `docs/PROGRESS.md`.)
5. **Seed that isolated instance only** — never `./emulator-data/`, never your preview.
6. **Clean up on exit** via a `trap`, stopping only the emulator process the script itself started. Your preview emulator is a different process and is never signalled.

### Why there are two browser-test suites

They are not duplicates — each covers something the other structurally cannot:

- **`test:e2e:emulator`** runs against the **production build** (`app/dist` served by `vite preview`). This is what real users would download: a static, fully-bundled artifact.
- **`test:e2e:devmode`** runs against a **real `vite dev` server**, exercising Vite's on-the-fly module transform and its `optimizeDeps` dependency pre-bundling cache. It uses `--force` so each run does a genuinely fresh dependency scan.

That second suite exists because of a real incident: a blank-screen crash that only happened in `vite dev` mode, which every production-build test was blind to by construction. Vite's dependency cache is keyed off `package.json`/lockfile hashes — **not** off a linked workspace package's source content — so a stale cache can miss a newly-added `booking-core` export. See [Troubleshooting](#blank-page-or-an-undefined-constant-from-booking-core).

### About test counts

`docs/PROGRESS.md` records dated verification results, including how many tests passed on a given day. **Treat those as a snapshot, not a target.** Test counts change as the project grows; a different number is not a failure. What matters is that the suites pass.

---

## 10. Troubleshooting

### Java runtime missing

**Symptom:** starting emulators fails with a message about Java, or one of the test scripts prints *"Refusing to start: no working 'java' found."*

**Diagnose:**

```sh
java -version
```

**Fix** — add Java to this terminal only (Apple Silicon path; use `/usr/local/...` on Intel):

```sh
export PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"
java -version
```

If it isn't installed: `brew install openjdk@21` (formula, no `sudo`).

### Node version mismatch

**Symptom:** an install or build fails with an engine/version complaint, or behaviour differs from this guide.

**Diagnose:**

```sh
node -v
```

**Fix** — select Node 22 for this terminal:

```sh
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
node -v
```

A newer default Node (v26, say) generally works fine for local development. The Node **22** target comes from `functions/package.json` and matters most at deploy time.

### Port 5173 already in use

**Symptom:** Vite reports the port is taken, or silently starts on 5174 instead.

**Diagnose — find out exactly what is holding it:**

```sh
lsof -iTCP:5173 -sTCP:LISTEN -P -n
```

**Before stopping anything, verify the process is really this project's dev server.** Use the PID from the output above:

```sh
ps -p <PID> -o pid,lstart,command      # is it node .../vite ?
lsof -a -p <PID> -d cwd -n | tail -1   # is its working directory this repo?
```

Only when **both** confirm it's your own Apex Cinema Vite server, stop it:

```sh
kill -TERM <PID>
```

Then confirm the port is free:

```sh
lsof -iTCP:5173 -sTCP:LISTEN -P -n     # no output = free
```

> **Never** use `killall node` or a remembered PID from an earlier session. PIDs are reused, and a broad kill can destroy unrelated work.

### Duplicate Vite processes

**Symptom:** you have servers on both 5173 and 5174; edits appear on one and not the other; a rebuilt dependency seems not to take effect.

This is a genuine trap: two `vite` processes share the same on-disk dependency cache (`app/node_modules/.vite/deps`), so one can rebuild it while the other keeps serving the old version.

**Diagnose — list every listener and confirm each one's directory:**

```sh
lsof -iTCP:5173 -iTCP:5174 -sTCP:LISTEN -P -n
for pid in $(lsof -iTCP:5173 -iTCP:5174 -sTCP:LISTEN -t -n | sort -u); do
  echo "--- $pid ---"
  ps -p "$pid" -o pid,lstart,command
  lsof -a -p "$pid" -d cwd -n | tail -1
done
```

**Fix:** verify each is this project's Vite server, stop them with `kill -TERM <PID>`, then start exactly one (see the restart command below).

### Blank page, or an undefined constant from booking-core

**Symptom:** the whole page goes blank, and the browser console shows something like `TypeError: Cannot read properties of undefined (reading 'toLocaleString')` pointing at a constant imported from `@apex-cinema/booking-core`.

**Why it happens:** Vite's dependency pre-bundling cache is keyed off `package.json`/lockfile hashes, **not** off a linked workspace package's source. When a new export is added to `booking-core`, a long-running dev server can keep serving a cache built *before* that export existed. The import then resolves to `undefined`. The app has no error boundary, so one such error blanks the entire page.

**Diagnose — ask the dev server what it is actually serving:**

```sh
# Find which cache version the browser is being told to load:
curl -s "http://localhost:5173/src/components/booking/ReviewStep.tsx" \
  | grep -o 'booking-core[^"]*"'

# Then check whether that exact chunk really contains the constant
# (substitute the ?v=... value printed above):
curl -s "http://localhost:5173/node_modules/.vite/deps/@apex-cinema_booking-core.js?v=XXXXXXXX" \
  | grep -c "ADVANCE_AMOUNT_LKR"
```

`0` means the served chunk is stale — the source is fine, the cache is not.

**Fix (forced re-optimization + hard reload):**

1. Stop the dev server with `Ctrl+C` in its terminal (or verify-then-`kill` per the steps above).
2. Rebuild the shared package and restart with a forced dependency re-scan:

   *Working directory: `~/Projects/apex-cinema`*

   ```sh
   npm run build --workspace packages/booking-core
   VITE_DATA_MODE=emulator npm run dev --workspace app -- --force --port 5173 --strictPort
   ```

   - `--force` discards the cached dependency pre-bundle and scans fresh.
   - `--port 5173` pins the port.
   - `--strictPort` makes Vite **fail loudly** instead of quietly moving to 5174 — which is exactly how duplicate servers appear in the first place.

   > The `--` before the flags is required: it passes them through npm to Vite rather than to npm itself. All three flags are supported by Vite 8 and are used by this repo's own `playwright.dev.config.ts`.

3. **Hard-reload the browser** — `Cmd+Shift+R` (macOS) / `Ctrl+Shift+R` — because the browser also caches the old module.

### No packages to choose from, or "Firebase service unavailable"

**Symptom:** the booking wizard shows no packages, availability never loads, or the staff schedule shows a loading/error notice.

**Diagnose, in order:**

1. Is Terminal 1 still showing `All emulators ready`? If it exited, restart it.
2. Did you start the frontend with `VITE_DATA_MODE=emulator`? Without it the app runs on fixture data and never contacts the backend.
3. Is the emulator seeded? Open **http://127.0.0.1:4000** → Firestore, and check that `roomTiers`, `rooms`, and `config/booking` exist.

**Fix:** if the data is genuinely missing, stop the emulators (`Ctrl+C`, letting the export finish) and run `npm run seed:emulator` once, then start `npm run emulators:seeded` again.

### Login fails — "no such account"

**Symptom:** the seeded credentials are rejected at `/staff/login`.

**Diagnose:** open **http://127.0.0.1:4000** → **Authentication** and look for `owner@apexcinema.test` and `staff@apexcinema.test`.

**Fix:** re-seed **only the accounts**, against the already-running emulator — see [§6](#how-accounts-are-created-and-what-to-do-if-login-is-missing). There is no need to reset your booking data to repair authentication.

### Permission denied / access denied

**Symptom:** *"Access denied"* on a page, or a Cloud Function returns a permission error.

**Diagnose:** which account are you signed in as? The top bar shows the email and role.

**This is usually correct behaviour, not a bug:**

- `/staff/overview` is **owner-only** — staff genuinely cannot open it.
- A Firestore `permission-denied` in the console is expected if something tried to write directly: the rules are default-deny, and **only Cloud Functions** may write bookings, payments, roles, or the audit log.

**Fix:** sign in as the owner account if you need the overview. If a permission error appears during a normal action, treat it as a real finding and read the rule in `firestore.rules` rather than loosening it.

### No selectable time slots late in the day

**Symptom:** every slot for today is unselectable, especially in the evening.

**Why:** business hours are **09:00–21:00** (Asia/Colombo) with 3-hour sessions starting at **09:00, 12:00, 15:00, 18:00**. A session must finish by 21:00, and start times already in the past are not offered. Late in the day, today legitimately has nothing left.

**Fix:** pick **tomorrow** (or use the *Tomorrow* quick-pick chip). This is correct behaviour, not a failure.

### Test port conflicts, or missing isolated test config

**Symptom:** `test:e2e:emulator` or `test:e2e:devmode` fails to bind 9199 / 8180 / 5101 / 5183, or reports a missing config.

**Diagnose:**

```sh
lsof -iTCP:9199 -iTCP:8180 -iTCP:5101 -iTCP:5183 -sTCP:LISTEN -P -n
ls -l firebase.test.json      # must exist at the repo root
```

**Fix:**

- A previous interrupted test run may have left an emulator behind. Identify it with the `ps` / `lsof ... -d cwd` verification steps above, confirm it belongs to this project, then `kill -TERM <PID>`.
- Don't run two isolated suites at once — they share the same ports and project id.
- If `firebase.test.json` is missing, restore it from git (`git checkout -- firebase.test.json`); the scripts reference it by name and cannot run without it.
- Remember `npm run test:emulators` uses the **default** ports — it will conflict with a running preview. Stop the preview emulators first, or use the isolated suites instead.

---

## 11. Data, configuration, and secrets

### What git ignores, and why

From `.gitignore`:

| Ignored | What it is |
|---|---|
| `node_modules/` | Installed dependencies — restore with `npm ci` |
| `dist/`, `build/`, `/functions/lib/`, `*.tsbuildinfo` | Compiled output — regenerate with the build scripts |
| `.env`, `.env.local`, `.env.*.local` | Your local config. **`.env.example` is deliberately *not* ignored** — it's the template |
| `emulator-data/` | Your local emulator database |
| `*.log`, `firebase-debug.log`, `ui-debug.log`, `.runtimeconfig.json` | Logs and runtime config |
| `coverage/`, `playwright-report/`, `test-results/`, `blob-report/` | Test output |
| `.DS_Store`, `.idea/`, `*.swp` | Editor / OS clutter |

### Source vs. generated — never edit the generated side

| Source (edit this, it's committed) | Generated (never edit, never commit) |
|---|---|
| `app/src/**` | `app/dist/**` |
| `functions/src/**` | `functions/lib/**` |
| `packages/booking-core/src/**` | `packages/booking-core/dist/**` |
| `app/.env.example` | `app/.env.local` |

A frequent beginner mistake is editing `functions/lib/*.js` (the compiled JavaScript). Those files are overwritten on every build. Always edit the TypeScript in `src/`.

### Preserving emulator data without committing it

Your local bookings live in `emulator-data/`, which is gitignored **on purpose** — it can contain the test data you typed in, and it is a database export, not source code.

- **To keep it across restarts:** always use `npm run emulators:seeded` and always let `Ctrl+C` finish exporting.
- **To back it up:** copy the folder somewhere outside the repository.

  ```sh
  cp -R emulator-data ~/apex-cinema-emulator-backup-$(date +%Y%m%d)
  ```

- **To restore:** copy it back before starting the emulators.
- **To start clean:** stop the emulators, then run `npm run seed:emulator` again.

### Secrets

- **Never** put a real secret in a `VITE_*` variable — those are compiled into the browser bundle and are publicly readable.
- The Firebase client values in `.env.example` are **identifiers, not secrets**. Security is enforced by Firestore rules and Cloud Functions, never by hiding config.
- Real server-side secrets (a payment merchant key, for example) would belong in server-side managed secret storage. No such secret exists in this repository today.
- **Never commit real customer information.** Use the fictional details in [§7](#7-practical-walkthroughs).
- The local test-account passwords in this README are emulator-only development credentials. They grant nothing outside your machine.

---

## 12. Git workflow

> This project's rules (`CLAUDE.md` #3) require **explicit approval** before pushing, deploying, or running destructive git commands.

A normal change:

```sh
# 1. Start from an up-to-date main
git checkout main
git pull origin main

# 2. Create a feature branch
git checkout -b feature/short-description

# 3. Work, then review exactly what you changed — always read this before committing
git status
git diff

# 4. Stage specific files (safer than `git add .`, which can sweep in stray files)
git add path/to/file.tsx

# 5. Re-check what is staged, then commit
git status
git commit -m "Short, clear description of the change"

# 6. Push and open a pull request
git push -u origin feature/short-description
```

Then open a pull request on GitHub targeting `main`, describing what changed, what you verified, and any limitations.

Before committing, it's worth running the read-only checks:

```sh
npm run typecheck && npm run lint && npm run test:unit
```

### Pushing code is **not** deploying the app

This deserves its own line, because it's a common misunderstanding:

- **`git push`** uploads your source code to GitHub. The live website is unaffected. Nobody's browser changes.
- **Deploying** would publish the built app to hosting so the public can reach it. **This repository has no deployment pipeline configured** — there are no GitHub Actions workflows and no automated deploy. Merging a pull request publishes nothing.

---

## 13. Current limitations and deployment status

### Not implemented (no code exists for these)

- **Online payment collection.** No PayHere integration, no card or bank flow. The customer journey ends at a 10-minute hold. The LKR 1,000 advance is *displayed* online but can only be *recorded* by staff, in person.
- **Refunds.** No refund policy is decided and no mechanism exists. This is why a booking with any recorded payment cannot be cancelled in the UI.
- **Notifications.** No email, SMS, or WhatsApp automation anywhere in the repository. Nothing is sent to a customer automatically.
- **Party (Room 6) booking management.** Party is contact-only by design; the schedule shows a note where its bookings would go.
- **Public deployment.** Running this locally does **not** make the site publicly available.

### Known rough edges

- `firebase.json`'s Functions `predeploy` hook builds only `functions` — it assumes `packages/booking-core` was already built. A real deploy pipeline must build booking-core first. Flagged rather than solved, since deployment is out of scope.
- `functions/package.json` targets Node **22** while local development may run a newer Node. Expected; only matters at deploy time.
- The mobile menu doesn't implement full keyboard focus-trap cycling. Escape-to-close and initial focus work; Tab doesn't loop from the last item back to the first.
- `app/src/data/index.ts` statically imports both the fixture and Firebase adapters, so the Firebase SDK ships in the production bundle regardless of `VITE_DATA_MODE`. Lazy-loading it would fix the bundle size but touches every call site.
- The Hosting emulator (port 5000) is deliberately not started, because macOS AirPlay Receiver usually holds that port. Vite serves the site instead, so it was never needed.
- Real room photography and real contact details are still pending. The site shows clearly-labelled placeholders and an honest "not available yet" contact state rather than inventing anything.

### Open business decisions

Several questions are **owner decisions, not engineering defaults**, and are deliberately unresolved in code. These are tracked in [`docs/DECISIONS.md`](docs/DECISIONS.md) — including the refund policy, the Party session duration and notice period, and payment-gateway selection.

For dated, phase-by-phase verification results and the full change history, see [`docs/PROGRESS.md`](docs/PROGRESS.md).
