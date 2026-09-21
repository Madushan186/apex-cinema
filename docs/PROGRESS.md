# Progress — Apex Cinema

## How to resume

At the start of any session: read `CLAUDE.md`, then this file, then skim `docs/DECISIONS.md` for any open questions that got answered since last time. Propose the next phase's scope, get approval, then implement only that phase.

## Environment notes (updated 2026-09-20)

- Repo: pushed to `https://github.com/Madushan186/apex-cinema`, `main` branch, up to date through the "Dev-server blank-screen fix" entry above. This phase's work (Phase 5) lives on a local feature branch, `feature/staff-manual-bookings`, cut from verified `main` — not merged or pushed, per this phase's instructions.
- Node: v26.5.0, npm 11.17.0 — the Cloud Functions target is Node **22** (`functions/package.json` `engines.node`); this mismatch is expected on this machine and only matters at actual deploy time, not local emulator development (flagged again each phase per instruction, unchanged).
- Java: **now installed** — `openjdk@21` via `brew install openjdk@21` (formula, no sudo needed; the `--cask temurin` alternative needs sudo for a system symlink and was not used). Required by the Firestore/Auth emulators (JDK 11+ per Firebase's official emulator docs, checked 2026-09-20). Not on PATH by default — see README.md for the export line, or prefix commands with `PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"`.
- `firebase-tools` is now a root devDependency (15.30.2) — no global install needed, invoke via `npm run` scripts or `npx firebase`.
- **A logo file appeared in `public/brand/`** (`Logo (1).png`, 1536×1024 PNG, ~2.1MB) between the planning-docs session and this one — added outside any session I ran. It was left completely untouched (not renamed, not moved, not processed) per CLAUDE.md rule 8. Note: CLAUDE.md/PROJECT_BRIEF.md reference the path `public/brand/apex-logo.png` specifically — the actual file has a different name, so nothing in the app currently resolves to it (the favicon link in `app/index.html` points at the documented `apex-logo.png` path and will 404 until this is reconciled). **Needs an owner decision**: rename the file to match the docs, or update the docs to match the actual filename — not done automatically since it wasn't asked for and visual-direction work is an explicitly separate future phase (1c below).

## Phase log

### Phase 0 — Planning documents (this phase)

**Status: done.**

Created:
- `CLAUDE.md`
- `docs/PROJECT_BRIEF.md`
- `docs/ARCHITECTURE.md`
- `docs/SECURITY.md`
- `docs/DECISIONS.md`
- `docs/PROGRESS.md` (this file)

No application code, no dependencies installed, no external accounts touched, nothing deployed, nothing committed to git yet (files exist on disk only — commit is a user decision).

**Resolved on 2026-09-19 (owner answered via question round):** deposit + balance-on-arrival is supported (D9; exact amount was open at the time — DECISIONS.md #3 — now decided: flat LKR 1,000 for every booking type, see D17, 2026-09-21); staff can cancel bookings under restriction, proposed default rule needs sign-off (D10, DECISIONS.md #6); booking confirmation goes by email, now a required checkout field (D11); cancellation refunds are case-by-case, manual, no automated refund flow (D12).

**Still open (see `docs/DECISIONS.md` for full detail):** party notice definition, party duration, exact deposit amount/percentage, customer self-service cancellation window, exact staff-cancellation cutoff rule, no-show policy, data retention period, day-of-week hours, PayHere account status.

**Cost risks surfaced (nothing enabled yet, flagging for future approval):**
- Firebase **Blaze plan** required for Cloud Functions and for Identity Platform (owner MFA) — needed by the time we implement functions, not before.
- **Identity Platform** (for owner MFA) has its own per-MAU pricing beyond a free allotment — negligible at single-owner scale but is a distinct feature to explicitly enable, not default-on.
- **Transactional email provider** (for booking confirmations, per D11) — expect a near-free tier at this business's volume, but it's a new external dependency to set up and hold API keys for.
- **PayHere** merchant/transaction fees (standard payment gateway cost, rate depends on their merchant agreement — not something this document can quote).
- Firestore/Functions usage-based cost is expected to be minimal at this business's likely traffic scale, but is non-zero once Blaze is enabled.
- Domain (`apexcinema.lk`) registration/renewal — assumed already owned or being handled outside this project; flag if not.

None of the above will be enabled without explicit approval at the relevant phase.

### Phase 1 — Project foundation (scaffolding only, no business logic)

**Status: done, fully verified 2026-09-20.**

Scope was explicitly limited to tooling/plumbing: React+Vite+TS, Tailwind+shadcn/ui, routing, linting, type checking, Vitest, Playwright, Firebase Hosting config, Emulator Suite integration, and the UI/pure-logic/adapters/functions separation. No booking/availability/pricing business logic, no auth, no PayHere integration, no deploy — those are later phases.

**Structure created (npm workspaces monorepo):**
- Root `package.json` (workspaces: `app`, `functions`, `packages/*`), `.gitignore`, `.env` handling, `README.md` (setup instructions), `eslint.config.mjs` (flat config, per-workspace rule sets).
- `packages/booking-core` — framework-agnostic pure logic package (no Firebase, no React). Contains `BookingStatus`/`PaymentStatus`/`TimeInterval` types mirroring docs/ARCHITECTURE.md §4, and one tested pure function (`intervalsOverlap`) — deliberately just the primitive, not the full availability algorithm (that's future-phase business logic, not foundation). 5 unit tests.
- `app` — Vite + React 19 + TypeScript SPA. Tailwind v4 (CSS-first config) + hand-written shadcn/ui setup (`components.json`, a `Button` component, the standard "new-york/neutral" CSS theme tokens — colors are shadcn defaults, not a real visual direction). Routing via `react-router` v8 (declarative mode) with placeholder `/`, `/book`, `/staff`, and a 404 route, all explicitly labeled as placeholders per CLAUDE.md rule 9. Firebase client adapter (`src/lib/firebase/client.ts`) that connects to the Emulator Suite by default and is the *only* file that imports `firebase/*` directly. 2 unit tests (Vitest + Testing Library) + 3 Playwright E2E smoke tests (tagged `@smoke`), run against the actual production build via `vite preview`.
- `functions` — Cloud Functions (TypeScript, Node 22 target). One placeholder `ping` callable that imports `@apex-cinema/booking-core` to prove the cross-package boundary resolves end-to-end — explicitly not part of the booking domain, to be replaced when real functions land. 1 unit test (pure handler logic) + 1 Functions-emulator integration test + 1 Firestore rules test (5 assertions) — 7 tests total, all run only under `firebase emulators:exec`.
- `firebase.json` / `.firebaserc` (default project alias `demo-apex-cinema`, which the Emulator Suite treats as offline-only — a technical guarantee, not just policy, that nothing here can reach a real project) / `firestore.rules` (default-deny; only `roomTiers/*` and `config/booking` are public-readable, matching docs/SECURITY.md §2 exactly — `bookings`, `payments`, `auditLog`, `staffAccounts` are fully denied, on purpose, until their real Cloud-Function-mediated access patterns exist) / `firestore.indexes.json` (empty).

**shadcn/ui note:** the `npx shadcn@latest init` CLI invocation was declined mid-session; by the user's choice, `components.json`, the CSS theme tokens, and the `Button` component were hand-written to match shadcn's current standard output instead of running the CLI/network install. Functionally equivalent; future `npx shadcn add <component>` commands will still work against this `components.json`.

**Version-pinning decisions worth knowing about:**
- **TypeScript pinned to `6.0.3`, not the new `7.0.2`.** TypeScript 7 (the native/Go-ported compiler) is npm's "latest" as of this session, but `typescript-eslint@8.70.0`'s peer range is `>=4.8.4 <6.1.0` — it does not support TS7 yet. Using TS7 would have broken `npm run lint` entirely. This is a real compatibility constraint, not a style choice; revisit when typescript-eslint adds TS7 support.
- **`react-router` (v8), not `react-router-dom`** — `react-router-dom` was removed in v8; confirmed against reactrouter.com's current docs. Declarative mode (`BrowserRouter`/`Routes`/`Route`/`Link`, all from the single `react-router` package) was used since nothing here needs data loaders yet.
- Tailwind v4, Vite 8, React 19.3, Vitest 5, Playwright 1.63, firebase 12.19 / firebase-tools 15.30 / firebase-admin 14.4 / firebase-functions 7.4 — all current stable per npm registry as of 2026-09-19/20.

**Verification actually run (not assumed):**

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | ✅ pass (booking-core, app, functions) |
| Lint | `npm run lint` | ✅ pass, 0 errors/warnings |
| Unit tests | `npm run test:unit` | ✅ 7/7 pass (5 booking-core + 2 app) |
| Production build | `npm run build` | ✅ succeeds — `app/dist` (760.7 kB JS / 231.8 kB gzip, 14.7 kB CSS). Chunk-size warning noted below, not an error. |
| E2E smoke (`@smoke`) | `npm run test:e2e` (serves the actual production build via `vite preview`) | ✅ 3/3 pass |
| Firebase emulator tests | `npm run test:emulators` (real Auth+Firestore+Functions emulators, `demo-apex-cinema` project) | ✅ 7/7 pass (1 functions unit + 1 functions-emulator integration + 5 Firestore-rules assertions) |
| `npm run dev` | manual boot check | ✅ boots, serves on `localhost:5173` (the sandbox's `127.0.0.1` curl didn't match `localhost`'s IPv6 binding — a local-network quirk, not an app bug; `preview`/Playwright explicitly bind `127.0.0.1` and were unaffected) |

**`npm audit` findings — explained, not force-fixed:**
7 moderate-severity findings, **all transitive dependencies of `firebase-tools`** (a root devDependency — the CLI, never imported by `app` or `functions` source, never bundled into the production build or the deployed Functions code): `@google-cloud/pubsub`, `@opentelemetry/core`, `csv-parse`, `gaxios`, `stream-json`, `uuid` (DoS-class / bounds-check issues in libraries firebase-tools uses internally for things like BigQuery/Pub-Sub export tooling this project doesn't use). `npm audit fix --force`'s only available "fix" is downgrading `firebase-tools` to `10.1.1` — a major regression, not a real fix — so it was **not applied**. Risk assessed as low (dev-only CLI, run locally against your own emulator, not exposed to untrusted input), but worth periodic `npm audit` review as firebase-tools ships patches upstream.

Separately: npm reported 4-5 packages' install scripts were skipped by this environment's script-allowlisting (`google-logging-utils`, `protobufjs`, `re2`, `@firebase/util`, `fsevents`) — all build-time native/optional steps for `firebase-tools`' dependency graph. No functional impact was observed (emulators and functions ran correctly in testing above); flagging in case a future session sees a firebase-tools feature that specifically needs one of these (e.g. `re2` is a regex-engine used by some Firestore rules tooling — a plain JS fallback is used otherwise).

**Cost/account impact of this phase: zero.** No Firebase project was created, no billing was touched, nothing was deployed, nothing was pushed to any remote. The only system-level change was installing a local JDK (`brew install openjdk@21`, done with explicit approval) and Playwright's Chromium browser binary (local dev tool cache, not a system change).

### Phase 2 — Customer-facing UI (local fixtures only)

**Status: done, fully verified 2026-09-20. Stopped for visual approval per the phase brief — no backend, no live payments, no deploy.**

Scope: the full customer-facing marketing site + guest booking wizard, dark theme, English/Sinhala localisation, all against typed local fixture adapters (no Firebase). Staff dashboards and real backend/payment integration are explicitly out of scope.

**Pages/flows completed:**
- Marketing: Home (hero, facts, package overview, gallery preview, "how it works", party teaser, FAQ preview), Packages, Rooms/Gallery, Party, FAQ, Policies, Contact — all dark-themed, all localised.
- Guest booking wizard (`/book`, 5 steps): Package → Date & time → Details → Review → Demo checkout, ending in one of 6 result screens (Awaiting payment, Verifying, Failed, Hold expired, Confirmed, Needs review — selectable via a "Simulate outcome" control on the checkout step for demo purposes).
- Header (desktop nav + mobile overlay menu), Footer, discreet mobile "Book a Room" bar (marketing pages only, never on `/book`).

**Design system:** `docs/DESIGN.md` — dark tokens exactly as specified, with two measured (not assumed) adjustments: a load-bearing `--border` token lifted from the proposed `#2b2b31` (1.33:1 against card — fails WCAG 1.4.11) to `#63636b` (3.14:1 — passes), and the shared `Button`'s focus ring changed from a 50%-opacity ring (found nearly invisible on the red button during live keyboard-nav testing) to fully opaque gold.

**Localisation:** full English/Sinhala dictionaries (`i18n/translations.ts`), type-checked for matching keys (`typeof en`, not `as const`, so `si` must match the same shape) plus a runtime parity test. Verified live: switching language mid-wizard preserves the route and every entered field (package, date, slot, name, phone, email, people count) with no reload — see verification section below. Sinhala font (Noto Sans Sinhala) loads only when Sinhala is actually selected.

**Data layer:** `data/types.ts` defines `PackagesAdapter`/`AvailabilityAdapter`/`BookingPreviewAdapter` interfaces; `data/fixtures/*` are the only implementations, composed once in `data/index.ts` — every route imports from there, so a future backend swap is a one-file change. Availability is deterministic (hash of date+package+time) with real Colombo-time-based "already passed today" handling, and support for an injected error state (`/book?fixtureError=1`, used by a fixture-error test). Contact details (`data/fixtures/contact.ts`) are all `null` — the UI shows an honest "not available yet" state rather than a placeholder number or a dead link, and logs a dev-only console warning listing what's missing.

**Firebase:** not touched. `main.tsx` no longer calls `connectToEmulatorsIfConfigured()` — that call (and `lib/firebase/client.ts` itself) is untouched foundation-phase infrastructure, just not invoked, since this phase has nothing that needs it. This also dropped the production bundle's biggest cost: the initial `/` route now loads ~386 KB raw / ~123 KB gzip (down from the foundation phase's single 760 KB bundle, which included the full Firebase SDK).

**Verification actually run:**

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | ✅ pass (booking-core, app, functions) |
| Lint | `npm run lint` | ✅ pass, 0 errors/warnings |
| Unit tests | `npm run test:unit` | ✅ 27/27 pass (5 booking-core + 22 app — added: i18n dictionary parity, booking-details validation, colomboTime date math, fixture availability adapter, App routing/rendering) |
| Production build | `npm run build` | ✅ succeeds, code-split per route (see bundle breakdown below) |
| E2E (`@smoke`) | `npm run test:e2e` | ✅ 6/6 pass — home hero+logo, client routing, 404, language switch (asserts `<html lang>` flips and content updates without navigating), party excluded from booking radios, and a full wizard run (package→date→details→review→checkout→confirmed) against the production build |
| Firebase emulator tests | `npm run test:emulators` | ✅ 7/7 pass (unchanged foundation-phase functions/rules tests — untouched this phase) |
| Manual browser verification | Chrome, real keyboard nav + JS-computed contrast + full wizard run in both languages | See below — found and fixed 1 real bug (focus ring), confirmed everything else |

**Bundle breakdown (initial `/` route vs. total):**
- Initial load for `/`: `index.css` (33.1 kB / 6.7 kB gzip) + main entry (297.1 kB / 94.4 kB gzip) + `LocaleProvider` (43.4 kB / 13.1 kB gzip, eager since every page needs `t()`) + `Home` and its direct chunks (~21.7 kB / ~9.1 kB gzip) ≈ **~395 kB raw / ~123 kB gzip**.
- Total production output across every route (Home, Packages, Rooms, Party, FAQ, Policies, Contact, Book, Staff, NotFound, all lazy-loaded): **~419 kB raw / ~134 kB gzip** — i.e. visiting Home costs almost the same as downloading the entire site, because each individual route chunk is tiny (0.2–23 kB); `Book` (the heaviest at 23 kB/6.3 kB gzip) and `Staff` are never downloaded by a visitor who only looks at marketing pages.

**Manual browser verification — what was actually checked (Chrome, via claude-in-chrome tools), and an environment limitation:**
- ⚠️ **`resize_window` did not change the tab's actual viewport in this sandbox** — `window.innerWidth` stayed at 1390px regardless of requested size (390×844, 1440×900, etc. — confirmed via direct JS inspection, tried on both the existing tab and a freshly created one). This means the 360px/390px/768px breakpoint checks in the phase brief could **not** be visually confirmed by me. What follows is what I could and did verify at the one real viewport available (~1390px, close to the "1440px" desktop case) plus direct code/CSS inspection for the others — see the manual-check list below for exactly what still needs your eyes.
- Contrast: computed precisely in-browser (not estimated) for every token pair — see docs/DESIGN.md §3. Found and fixed the border-contrast issue and the button focus-ring issue there.
- Keyboard navigation: Tab order through skip-link → logo → nav → language switch → Book a Room confirmed, with a visible gold `:focus-visible` ring on every stop (after the button fix).
- Full booking wizard: ran twice end-to-end (AC Small and Non-AC packages) with real typing, including a deliberate over-capacity entry (5 people on a 3-person package) that correctly blocked progression with an inline error.
- Language switch: verified mid-wizard (step 3, all 4 fields filled) — URL, route, and every field value were unchanged after switching to Sinhala and back; `<html lang>` and the document title updated correctly both directions.
- Outcome states: visually confirmed "Booking confirmed" (reference code, full detail table, working email-delivery-preview toggle, download/print buttons fire with no console errors), "Payment failed" (Try again returns to checkout with the hold timer still counting down), and "Payment received — booking needs review". The other three (Awaiting payment, Verifying, Hold expired) share the same rendering path and were confirmed by code review, not a live screenshot, since exercising them all would have meant repeating the full 5-step flow six times.
- Party/Contact honest-unavailable states, Policies draft notice, and the FAQ accordion all rendered and behaved as designed.
- Mobile menu: could not be seen open (it's `lg:hidden`, correctly computed to `display:none` at the available 1390px viewport) — confirmed its logic is wired correctly by forcing it open via script (all 8 expected links present, `role="dialog"` present, Escape correctly closes it) rather than by looking at it.

**Manual checks still needed from you** (things I could not visually confirm — see limitation above):
- At 360px, 390px, and 768px widths: no horizontal overflow anywhere, header collapses to the hamburger menu and the mobile menu opens/closes/scrolls correctly, the mobile booking bar doesn't overlap content or the keyboard while typing in the wizard, and Sinhala text (which runs longer than English) doesn't clip or overflow any button/card/label at these widths.
- The three untested result screens (Awaiting payment, Verifying, Hold expired) — reachable via the "Simulate outcome" dropdown on the checkout step, or by actually waiting out the 10-minute demo hold for Hold expired.
- The downloaded demo-confirmation `.txt` file's actual content/filename (I triggered the download and confirmed no console error, but didn't retrieve the saved file in this sandbox).

**Missing real assets/decisions, unchanged from before, relevant to this phase:**
- No real room photography — placeholders used throughout, clearly labelled.
- No WhatsApp number, phone number, email, or address — Party/Contact show an honest "not available yet" state.
- Exact deposit amount (DECISIONS.md #3), party duration (#2), party notice definition (#1), and the staff-cancellation cutoff (#6) remain open — none of them block this customer-only phase, but they will when the real backend is built.
- The `public/brand/Logo (1).png` vs. documented `apex-logo.png` filename mismatch (flagged in Phase 1) is still unresolved.

**How to preview locally:**
```
npm install        # if not already done
npm run dev         # http://localhost:5173 — dev server, fastest iteration
# or, to check the actual production build:
npm run build && npm run preview --workspace app
```
No `.env` setup needed — see README.md. Try `/book?package=ac-small` to skip straight into the wizard with a package pre-selected, and `/book?fixtureError=1` to see the availability-error state.

**Which fixture states are inspectable right now:**
- Availability: pick any date/package in the wizard — Non-AC (3 rooms) shows available/limited/full realistically; AC Small/Large (1 room) only ever show available/full. Today's already-passed slots show "Already passed today" automatically (real Asia/Colombo time, not hardcoded).
- Checkout outcomes: all 6, via the dropdown on the demo-checkout step.
- Error state: `/book?fixtureError=1` on the date/time step.
- Contact-missing state: Party and Contact pages, as-is (no config needed to see it — it's the default).

**Known limitations (intentional or flagged, not bugs):**
- Full keyboard focus-trap cycling inside the mobile menu isn't implemented (Escape-to-close and initial focus are) — see docs/DESIGN.md §4.
- True mobile/tablet viewport rendering wasn't visually verified by me this session (sandbox limitation above) — please check the breakpoints yourself before treating this as approved.
- The three less-common checkout outcome screens were verified by code review, not a live screenshot.

### Phase 2 patch — Location correction & homepage copy fixes (2026-09-20)

**Status: done, verified.**

Owner corrected the business location: Apex Cinema is in **Kurunegala, Sri Lanka** (කුරුණෑගල) — **not Kandy**. "Kandy" was a placeholder city I introduced while writing the hero copy in the customer-UI phase without it having been supplied as a fact — a fabrication, not a typo, and it should not have been there. Searched the full app source, both translation dictionaries, metadata, fixtures, and all docs for "Kandy" and other location references; only the two hero-subtitle strings (English + Sinhala) in `i18n/translations.ts` were affected. Corrected to "Kurunegala" / "කුරුණෑගල". No street address, coordinates, or map pin were invented — those remain `null` in `data/fixtures/contact.ts` per the existing honest-unavailable pattern. Recorded as D13 in `docs/DECISIONS.md` and added to `docs/PROJECT_BRIEF.md`.

Also fixed two homepage copy issues flagged in the same review:
- "Choose your room" → "**Choose your package**" (English + Sinhala) — rooms are auto-assigned within a package, so "room" was the wrong noun for a selection the customer isn't actually making.
- The homepage packages subtitle claimed "every package includes... PS4... YouTube/Netflix" — reworded to explicitly name the three bookable tiers ("Non-AC, AC Small, and AC Large all include...") so it can't be read as covering the Party package. More substantively, the **Party fixture itself** (`data/fixtures/packages.ts`) listed `streaming-4k` (YouTube/Netflix on the 4K projector) as one of its features — PROJECT_BRIEF only confirms a 4K projector for Party, not the streaming-service claim. Added a new `projector-4k` feature (plain "4K projector", no streaming claim) and switched Party to use it instead; the three bookable packages are unaffected. This was a real data-accuracy bug, not just copy — anyone who opened the Party page was shown an unconfirmed feature as if it were confirmed.

**Files changed:** `app/src/i18n/translations.ts`, `app/src/data/types.ts`, `app/src/data/fixtures/packages.ts`, `app/src/components/FeatureList.tsx`, `docs/PROJECT_BRIEF.md`, `docs/DECISIONS.md`.

**Verification:**
| Check | Result |
|---|---|
| `npm run typecheck` | ✅ pass |
| `npm run lint` | ✅ pass |
| `npm run test:unit` | ✅ 27/27 pass (i18n parity test confirms `en`/`si` still match exactly) |
| `npm run build` | ✅ succeeds, bundle sizes essentially unchanged |
| Manual browser check (English + Sinhala) | ✅ Home hero shows "Kurunegala"/"කුරුණෑගල", "Choose your package"/"ඔබේ Package එක තෝරන්න", scoped subtitle naming the three tiers; Party page shows "4K projector" with no PS4/streaming claim, in both languages; language switch and persistence re-confirmed working |

E2E and emulator suites were not re-run for this small patch (no route/behavior change, only copy/data-label content) — typecheck, lint, unit tests (including the i18n parity check), build, and a manual bilingual browser pass covered the actual change surface.

Not deployed — no build/deploy step beyond the local production build used for verification.

### Phase 2 patch 2 — Packages page fixes (2026-09-20)

**Status: done, verified.**

Owner reviewed a screenshot of the Packages page and flagged six issues, all UI/content only (no booking logic touched):

1. **Party pricing showed "per 3-hour session".** The shared `PackageCard` always rendered `common.perSession` ("per 3-hour session") regardless of package, so Party's card — via that same component — implied a confirmed duration it doesn't have. Fixed by taking Party out of `PackageCard` entirely (see #3) and giving it its own duration-free label: new `common.perSessionNoDuration` key ("per session" / "session එකකට"). The dedicated `/party` page already had the correct wording — the bug only reached the *listing* card.
2. **Room-number badges removed from public cards.** `PackageCard` no longer renders a "Room 4"/"Rooms 1–3" badge. The `roomNote` i18n strings were deleted (they only ever existed to feed that badge); a `roomLabel` field was added to `PackageDefinition` (`data/types.ts`, populated in `data/fixtures/packages.ts`) so the room identifier still lives in the data model for a future staff view. The existing page subtitle ("Automatic room assignment within your chosen package — you never pick a room number.") already serves as the one concise explanation asked for — no new copy needed there.
3. **Layout rebuilt.** `routes/Packages.tsx`: the three bookable packages render in a `sm:grid-cols-3` grid (equal columns, aligned headings/prices/buttons via the existing `flex h-full flex-col` card pattern); Party moved out of that grid into its own full-width bordered section below, laid out `flex-col` (mobile) → `lg:flex-row` (desktop). Also dropped a redundant duplicate "per room" note that was previously shown twice on the page (once as the eyebrow, once again at the bottom) — one occurrence is enough and this directly reduces the empty space the owner flagged.
4. **Extension note added**: `packages.extensionNote` — "+1 hour: LKR 1,000 — subject to availability and staff approval; sessions must end by 9 PM." (exact wording, naturally translated to Sinhala) — shown once below the standard-package grid, not repeated per card. No online extension selector was added.
5. **Logo size increased.** `Logo.tsx`'s `header` size went from `h-10 sm:h-12` to `h-14 sm:h-16`, `footer` from `h-12 sm:h-14` to `h-16 sm:h-20`. The header bar height (`Header.tsx`, both the desktop row and the mobile-menu's own header row) was bumped from `h-16` to `h-20` so the larger logo has room and isn't clipped. Verified by re-inspecting the source PNG's alpha channel (same file, same non-negotiable "don't touch the artwork" constraint as before) — sizing is still purely via `h-*` + `w-auto` + `object-contain`, so proportions and the original file are untouched; only the container got bigger.
6. **Party CTA was quietly misleading.** `packages.contactForParty` said "Enquire on WhatsApp" ("WhatsApp මගින් අසන්න"), but the button only navigates to `/party` — it does not open WhatsApp, and no WhatsApp number is configured. That's exactly the "misleading clickable action" this project's own rules forbid. Changed the label to "See Party details" ("Party විස්තර බලන්න") — an honest description of what actually happens on click. The `/party` page itself already shows the correct "Contact details coming soon — we haven't published a WhatsApp number or phone line yet" state (`ContactActions.tsx`, unchanged, re-verified) — nothing there needed fixing, only the mislabeled entry point on the Packages page.

**Files changed:** `app/src/i18n/translations.ts`, `app/src/data/types.ts`, `app/src/data/fixtures/packages.ts`, `app/src/components/PackageCard.tsx`, `app/src/components/brand/Logo.tsx`, `app/src/components/layout/Header.tsx`, `app/src/routes/Packages.tsx`, `app/src/routes/Home.tsx` (type-narrowing update only, required because `PackageCard` now only accepts bookable packages).

**Verification:**

| Check | Result |
|---|---|
| `npm run typecheck` | ✅ pass |
| `npm run lint` | ✅ pass |
| `npm run test:unit` | ✅ 27/27 pass (i18n parity test confirms `en`/`si` still match exactly after removing `roomNote`/`perRoomNote` and adding `perSessionNoDuration`/`extensionNote`) |
| `npm run build` | ✅ succeeds — `PackageCard` chunk actually shrank (3.15 kB → 1.85 kB) from removing the Party-specific branching |
| Manual browser check, English + Sinhala | ✅ 3-column standard grid with aligned headings/prices/buttons, no room badges, exact extension-note wording, Party section full-width below showing "LKR 12,500" + "per session" (no duration) and "4K projector" (no PS4/streaming), "See Party details" CTA, bigger header/footer logo with the full wordmark+tagline visible and not clipped, keyboard Tab reaching every button with a visible gold focus ring, no horizontal overflow at the available desktop viewport |

**Same sandbox limitation as the previous phase**: `resize_window` still does not change this environment's actual browser viewport (confirmed again — stuck at a fixed width regardless of requested size), so the 390px mobile layout was **not** visually confirmed by me. The responsive classes used (`sm:grid-cols-3`, default single-column below `sm`, `flex-col` → `lg:flex-row` for the Party section) are standard, already-working Tailwind patterns reused from the rest of the site, but please verify the actual mobile rendering yourself before treating this as approved.

Not deployed. No booking logic, backend, or data-fetching behavior was touched — this was UI/content only, as scoped.

### Phase 3 — Secure booking engine (local emulators only)

**Status: done, fully verified 2026-09-20. Stopped after this report per the phase brief — no payments, staff dashboards, or deploy.**

**What existed before this phase:** a single placeholder `ping` Cloud Function (foundation-phase smoke test) and default-deny Firestore rules allowing public reads of `roomTiers`/`config/booking` only. Every customer-facing screen ran on local, in-memory fixtures — nothing in the app had ever called a real Cloud Function.

**What this phase added:** real, transaction-safe Cloud Functions for package retrieval, availability, and room-hold creation, wired into the existing frontend through its adapter boundary, with an explicit fixture/emulator mode switch so visual preview still works exactly as before.

#### Shared foundation (`packages/booking-core`)

Moved the business-hours constants, Colombo date/time helpers, and the package catalog (prices/capacities/room ids) out of app-only fixture files and into the shared package, so the frontend and Cloud Functions provably can't disagree on a fact:
- `businessRules.ts` — `OPEN_MINUTE`/`CLOSE_MINUTE` (09:00/21:00), `SESSION_MINUTES` (180), the 4 public start times, `isValidDateISO`, `isValidPeopleCount`, `endsWithinBusinessHours`.
- `packageCatalog.ts` — `PACKAGE_CATALOG`, the single source of truth for prices/capacities/room ids (previously duplicated in `app/src/data/fixtures/packages.ts`), plus `priceLKRToMinorUnits`.
- `time.ts` — the existing Asia/Colombo helpers, moved here unchanged; `app/src/lib/colomboTime.ts` is now a one-line re-export.
- `types.ts` — `PackageDefinition`/`AvailabilityResult`/`SlotAvailability`/etc. moved here from `app/src/data/types.ts`, which now re-exports them. A real backend response is now structurally guaranteed to match what the frontend already expected from the fixtures.

#### Backend (`functions/src`)

- **`getPackages`** — public, unauthenticated. Reads the `roomTiers` collection (seeded from `PACKAGE_CATALOG`, not hardcoded in the function), returns all four tiers including Party (`isBookableOnline: false`).
- **`getAvailability`** — public, unauthenticated. Validates `packageId` (must be bookable — rejects Party) and `dateISO`, then computes `{time, status, roomsFree, roomsTotal}` per public slot by reading each candidate room's inventory doc directly. No booking id, no customer field, ever (`lib/availability.ts`).
- **`createHold`** — public, unauthenticated (guest checkout, no registration). The actual engine: validates the full request (package, date, time, capacity, name/phone/email format, idempotency key), rate-limits by hashed email, then runs one Firestore transaction (`lib/inventory.ts`) that finds a free room and atomically reserves it.

**Inventory design** — one small doc per `(roomId, dateISO)` in a new `inventory` collection, holding every interval ever booked on that room that day (`{bookingId, startMinute, endMinute, status, holdExpiresAtMillis}`). `createHold`'s transaction reads every candidate room's doc for the tier (1 for AC Small/Large, 3 for Non-AC — always a small, bounded number of direct document reads, never a query), treats an interval as "active" only if it's `confirmed` or a still-unexpired `pending_hold` (checked against the function's own `Date.now()`, never a client-supplied time), and writes to exactly one room's doc plus a new `bookings` doc, all in that single transaction. Firestore automatically retries the whole callback if a concurrent write touches any document it read; if no room is free, the function throws *before* staging any write, so a failed attempt is guaranteed to leave zero partial state. Any future inventory-changing operation (payment confirmation, cancellation, an approved extension) must reuse this exact doc shape and transaction pattern — documented as a hard requirement in `docs/ARCHITECTURE.md` §6 and in code comments.

**Idempotency** — a client-generated key maps (via `holdIdempotency/{key}`) to a fingerprint of the meaningful request fields plus the exact cached response. An identical retry returns that same response untouched (no new hold); a reused key with a *different* request is rejected with `already-exists`, never silently served from the wrong cache entry.

**Half-open intervals, confirmed working**: `09:00–12:00` and `12:00–15:00` on the same room don't conflict (adjacent, no buffer); a `09:00–13:00` occupied interval (simulating an approved extension) correctly blocks the `12:00–15:00` public slot without affecting `15:00–18:00` — both proven against the real emulator, not just unit-tested in isolation.

**Abuse protection**: a fixed-window rate limiter (`lib/rateLimit.ts`, 8 requests/60s per hashed email) guards `createHold`; every input is bounded-length and format-validated before anything touches Firestore (`lib/validation.ts`).

**Payment policy — flagged, not invented**: docs/DECISIONS.md open item #3 (deposit amount/percentage) is still unresolved. `createHold` computes the *full* package price server-side and stops there — there is no confirm/payment function in this phase, deliberately, since building one would have forced a guess between full-payment and an unspecified deposit split. See the note added to DECISIONS.md #3.

#### Seed script (`functions/src/scripts/seed.ts` → `npm run seed:emulator`)

Repeatable (every write is a deterministic `.set()`, safe to re-run anytime) and refuses to run unless it can positively confirm it's talking to the emulator: throws unless `FIRESTORE_EMULATOR_HOST` is set *and* the resolved project id starts with `demo-`. Seeds `roomTiers`, `rooms`, and `config/booking` (including `holdDurationMinutes`, read by `createHold` — see docs/DECISIONS.md D7) straight from `PACKAGE_CATALOG`.

#### Firestore rules (`firestore.rules`)

Added explicit (not just catch-all) deny rules for `inventory`, `bookings`, `holdIdempotency`, `rateLimits`, and `rooms` — all default-denied to any direct client read/write. Reminder written into the file itself: the Admin SDK (every function above) bypasses these rules entirely, so this file is not the access-control layer for the booking engine — `functions/src/lib/validation.ts` and the transaction in `lib/inventory.ts` are.

#### Frontend wiring (`app/src`)

- **`lib/dataMode.ts`** — `DATA_MODE` (`"fixture"` default, `"emulator"` via `VITE_DATA_MODE=emulator`). Nothing about existing preview behaviour changes unless this is set explicitly.
- **`data/firebase/`** — real adapters (`packagesAdapter`, `availabilityAdapter`, `holdsAdapter`) calling the three functions above via `httpsCallable`, composed in `data/index.ts` alongside the untouched fixture adapters. Firebase is only ever initialized/connected to the emulator when `DATA_MODE === "emulator"`.
- **`HoldsAdapter`** (new interface in `data/types.ts`) + `HoldError` (discriminated by `unavailable` / `invalid-request` / `idempotency-conflict` / `rate-limited` / `unknown`) — the real, non-fixture concept of "temporary checkout hold," distinct from `BookingPreviewAdapter`'s instant fixture make-believe.
- **`components/booking/EmulatorCheckoutStep.tsx`** — a new checkout-step component used *only* when `DATA_MODE === "emulator"` (wired into `Book.tsx`'s existing step 4), kept deliberately separate from the fixture `CheckoutStep`/`ResultScreen`: no "simulate outcome" dropdown, a visible "EMULATOR" badge, and states for loading, success (real hold reference + amount + live countdown to the real `expiresAtMillis`), expired (countdown reaching zero), and each error reason — all translated in English and Sinhala (`booking.emulator.*` in `i18n/translations.ts`). A successful result never says "Booking confirmed" — only "Hold created," with an explicit "Not charged — payment isn't implemented in this phase" note.

**Known, measured tradeoff**: `data/index.ts` statically imports both the fixture and Firebase-backed adapters, so the Firebase SDK is now in every build's initial bundle regardless of `DATA_MODE`. The `data` chunk grew from ~3 kB to ~482 kB raw / ~143 kB gzip. This undoes part of Phase 2's bundle-size win. Fixing it properly means lazy-loading the emulator adapters behind a dynamic `import()`, which would touch every call site currently expecting synchronous adapter exports — judged out of scope for this phase's time budget; flagged here rather than left undocumented.

#### Verification actually run

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | ✅ pass (booking-core, app, functions) |
| Lint | `npm run lint` | ✅ pass, 0 errors/warnings |
| Unit tests | `npm run test:unit` | ✅ 43/43 (21 booking-core incl. new business-rules/catalog tests, 22 app — unchanged) |
| Production build | `npm run build` | ✅ succeeds (see bundle tradeoff above) |
| E2E, fixture mode | `npm run test:e2e` | ✅ 6/6 — unchanged from Phase 2, now explicitly excludes the new `@emulator` test via `--grep-invert` |
| **E2E, real emulator** | `npm run test:e2e:emulator` (new) | ✅ 1/1 — a real browser run of the full wizard through `EmulatorCheckoutStep`, ending in a real hold reference (`APX-…`), against the actual Functions+Firestore emulators |
| **Backend emulator + rules tests** | `npm run test:emulators` | ✅ 31/31 — see full scenario list below |

**Every explicitly required scenario, and where it's proven:**

| Requirement | Result | Test |
|---|---|---|
| Two simultaneous AC Small requests: at most one succeeds | ✅ exactly 1 of 2 | `inventory.emulator.test.ts` "two simultaneous requests for AC Small" |
| Four simultaneous Non-AC requests: at most three succeed | ✅ exactly 3 of 4 | same file, "four simultaneous requests for Non-AC" |
| Idempotent retries do not duplicate reservations | ✅ same holdId/reference returned, 1 interval persisted | "idempotency" describe block |
| Idempotency-key reuse with a different request is rejected | ✅ `already-exists` | same block |
| Expired holds become reusable | ✅ backdated a real hold's `holdExpiresAtMillis`, new request for the same slot then succeeded | "expired holds become reusable" |
| Invalid capacities/dates/starts rejected | ✅ 6 distinct invalid-input cases, all `invalid-argument` | "validation" describe block |
| Tampered amount has no effect | ✅ sent `totalAmountMinor: 1` in the payload; server returned the real 320000 | same block |
| Adjacent sessions do not conflict | ✅ 09:00–12:00 then 12:00–15:00 on the same 1-room tier, both succeeded | "adjacency and partial-overlap blocking" |
| 09:00–13:00 occupied blocks 12:00–15:00 | ✅ availability showed "full" and a real createHold attempt was rejected; 15:00 unaffected | same block |
| Failed transactions leave no partial inventory | ✅ interval count identical before/after a rejected sold-out attempt | "failed transactions leave no partial inventory change" |
| Public responses expose no PII | ✅ slot object keys checked exactly; serialized response scanned for `@`/`bookingId` | "getPackages / getAvailability" block |
| Browser clients cannot write inventory or mark payments successful | ✅ 6 rules assertions incl. a targeted `.update({paymentStatus: "succeeded"})` attempt | `firestore.rules.test.ts` |
| Production access is not used during tests | ✅ asserted `FIRESTORE_EMULATOR_HOST` is set and project id starts with `demo-` | "environment sanity" block |

**Not run / not applicable:** no PayHere sandbox test (no payment integration exists this phase); no load/stress test beyond 2–4 concurrent requests (enough to prove the transaction logic, not a capacity benchmark).

#### How to start the frontend and emulators together

```sh
# One-time (or whenever you want a clean reset): seed the catalog into a persisted local snapshot
npm run seed:emulator

# Terminal 1 — emulators (Auth + Firestore + Functions only; Hosting is skipped,
# the frontend runs via Vite directly — see the port-5000 note below)
npm run emulators:seeded

# Terminal 2 — the app, built against the real backend
VITE_DATA_MODE=emulator npm run dev --workspace app
```
Then open the dev server URL and go through `/book` — the checkout step will show the "Real booking engine preview" (EMULATOR badge), not the fixture "Demo checkout". Firestore data persists in `./emulator-data/` (gitignored) between runs of `emulators:seeded` — re-run `npm run seed:emulator` any time to reset it back to a clean, freshly-seeded state.

**Environment note discovered this session**: `firebase emulators:start` with no `--only` flag tries to start the Hosting emulator too, which fails on this machine because macOS's Control Center (AirPlay Receiver) already holds port 5000 — a common macOS default, not specific to this repo. Fixed by scoping `emulators`/`emulators:seeded` to `--only auth,firestore,functions` (Hosting was never needed for this workflow — the frontend is served by Vite, not by the Hosting emulator).

#### Files changed

`packages/booking-core/src/{types,businessRules,time,packageCatalog,index}.ts` + 2 new test files; `app/src/lib/colomboTime.ts` (now a re-export), `app/src/data/types.ts`, `app/src/data/fixtures/packages.ts`, `app/src/data/index.ts`, `app/src/lib/dataMode.ts` (new), `app/src/data/firebase/{packagesAdapter,availabilityAdapter,holdsAdapter}.ts` (new), `app/src/components/booking/EmulatorCheckoutStep.tsx` (new), `app/src/hooks/useCountdown.ts` (added `useCountdownUntil`), `app/src/routes/Book.tsx`, `app/src/i18n/translations.ts` (`booking.emulator.*`, both languages); `functions/src/{index,getPackages,getAvailability,createHold}.ts` (new), `functions/src/lib/{firestore,validation,rateLimit,reference,config,inventory,availability}.ts` (new), `functions/src/scripts/seed.ts` (new), `functions/tests/inventory.emulator.test.ts` (new, 19 tests), `functions/tests/firestore.rules.test.ts` (+6 assertions); `app/e2e/emulator.spec.ts` (new); `firestore.rules`; root `package.json` (`seed:emulator`, `emulators:seeded`, `test:e2e:emulator`, scoped `--only` on `emulators`); `functions/package.json` (`seed:emulator` script); `docs/ARCHITECTURE.md` (§3/§5/§6 marked implemented), `docs/DECISIONS.md` (#3 addendum).

#### Known limitations / honest gaps

- The bundle-size tradeoff above (Firebase SDK now always bundled).
- No payment/confirm function — a hold is the end of the line this phase, as scoped.
- No scheduled/cosmetic expiry sweep — correctness doesn't need it (see docs/ARCHITECTURE.md §6), but a staff calendar view would currently show a stale `pending_hold` status past its expiry until something reads/rewrites it. Not built yet since there's no staff view yet either.
- The rate limiter is a simple fixed-window counter, not a sophisticated abuse system — adequate for a local-emulator phase, not a claim of production-grade DDoS protection.
- Only one frontend E2E emulator test exists (the full happy-path wizard). The error/expired/unavailable states in `EmulatorCheckoutStep` are exercised by the backend's own rejection tests (proving the function throws correctly) and were manually reasoned through in the component, but not each individually driven through a real browser.

### Phase 4 — Staff/Owner authentication & read-only dashboards (local emulators only)

**Status: done, verified 2026-09-20. Stopped after this report per the phase brief — no mutations, payments, or deploy.**

**What existed before this phase:** guest-only checkout (Phase 3's `createHold`) and a single unauthenticated `Staff` placeholder route explicitly marked "no authentication or role checks exist yet." Nothing in the app had ever called Firebase Auth.

**What this phase added:** real Firebase Auth (emulator-only) for staff/owner sign-in, server-enforced role checks on two new read-only Cloud Functions, and two read-only dashboards (staff schedule, owner booking-count overview) — with every permission decision made server-side, never by hiding a button.

#### Role model (unchanged from docs/ARCHITECTURE.md §8 — no second mechanism invented)

Role lives **only** as a Firebase Auth custom claim (`{role: "staff" | "owner"}`) on the user's ID token. `functions/src/lib/auth.ts`'s `requireRole(request, allowedRoles)` is the single place any function checks it — it reads `request.auth.token.role` from the verified token and throws `unauthenticated` (no `request.auth` at all) or `permission-denied` (wrong/missing role), and it **never reads `request.data`** for role, so a client cannot spoof or self-upgrade a role by sending `{role: "owner"}` in the payload (proven in `functions/tests/staffAuth.emulator.test.ts`, "role spoofing" test). There is no public registration, no role-selection UI, and no client code path that can write a custom claim — only `functions/src/scripts/seedAuthUsers.ts`, run manually against the emulator, ever calls `setCustomUserClaims`.

#### Backend (`functions/src`)

- **`lib/auth.ts`** — `requireRole()`, described above.
- **`lib/schedule.ts`** — `getBookingsForDate(dateISO)`: one bounded (`limit(200)`), non-indexed query (`where dateISO ==`, sorted in memory) against the existing `bookings` collection, mapped to a `ScheduleBooking` that deliberately **excludes `customerEmail`** (staff need a name/phone to find someone at the front desk, not to email them — data minimization beyond what was strictly asked). `deriveStatus()` computes a **displayed** status (`active-hold` / `expired-hold` / `confirmed` / `other`) from the stored `bookingStatus` plus a live check of `holdExpiresAt` against the function's own clock — the same rule `createHold`'s transaction uses. The stored document is never rewritten just to display correctly, so a hold can never be shown as confirmed. `summarizeCounts()` derives the owner's counts from the same list — no separate/duplicated status logic.
- **`getStaffSchedule`** (`staff` + `owner`) — returns the day's bookings across all 6 rooms.
- **`getOwnerOverview`** (`owner` only) — returns `{total, activeHolds, expiredHolds, confirmed}` only. **Deliberately a separate function**, not an extra field on `getStaffSchedule`, specifically so there's a genuine owner-exclusive endpoint to prove "staff cannot access owner-only endpoints" against. No payment/financial data exists anywhere in the response — counts only, as scoped.
- **`functions/src/scripts/seedAuthUsers.ts`** (`npm run seed:auth`) — repeatable (looks up by email, updates in place rather than erroring on a duplicate) and refuses to run unless it can positively confirm it's talking to the emulator (`FIREBASE_AUTH_EMULATOR_HOST` set **and** the resolved project id starts with `demo-` — same dual-check pattern as the existing `seed.ts`). Creates exactly one Owner and one Staff account and sets their custom claims. Wired into `test:emulators`, `test:e2e:emulator`, and `seed:emulator` so every test run has both accounts available.

**Local emulator-only test credentials** (development-only — refuses to run against anything but the emulator, never a real account, never a real password):

| Role | Email | Password |
|---|---|---|
| Owner | `owner@apexcinema.test` | `LocalOwner!123` |
| Staff | `staff@apexcinema.test` | `LocalStaff!123` |

#### Firestore rules — unchanged, and proven to stay that way

No rule changes were needed: every staff/owner read goes through a Cloud Function (Admin SDK, bypasses rules entirely), never direct client Firestore access — matching the existing "rules are not the access-control layer for anything Admin-SDK-mediated" note from Phase 3. Added two new assertions to `firestore.rules.test.ts` using `authenticatedContext(uid, {role: "staff"|"owner"})` — i.e. a token that actually carries the real custom claim — proving that having the role claim grants **zero** direct client Firestore access to `bookings`/`inventory` (defense-in-depth: the only path in is the function, even for a legitimately-claimed account).

#### Frontend (`app/src`)

- **`hooks/useStaffAuth.ts`** — wraps `onAuthStateChanged`/`signInWithEmailAndPassword`/`signOut`, exposing `status: "loading" | "signed-out" | "session-expired" | "signed-in"` and `role` (parsed from the ID token's custom claim, never trusted from anywhere else). Distinguishes a **deliberate** sign-out from an **unexpected** one (account disabled, emulator restarted mid-session) so the latter surfaces as "session-expired" instead of looking identical to "never signed in."
- **`components/staff/RequireRole.tsx`** — the frontend guard: shows a loading state while auth resolves, a fixture-mode notice if `DATA_MODE !== "emulator"` (never attempts a broken sign-in against uninitialized Firebase), a session-expired or signed-out prompt linking to `/staff/login`, an access-denied message if signed in with the wrong/no role, or the protected content. **This is a UX convenience only** — every actual permission decision already happened server-side in `requireRole()`; this component exists so someone without access sees a clear message instead of a screen that immediately errors.
- **`data/firebase/staffApi.ts`** — typed wrappers for the two callables.
- **`routes/staff/StaffLogin.tsx`**, **`StaffSchedule.tsx`**, **`OwnerOverview.tsx`** + **`components/staff/{DateNav,StaffTopBar,scheduleFormat}.ts(x)`** — the login form (maps `auth/invalid-credential`/`auth/user-not-found`/`auth/wrong-password`/`auth/invalid-email` to a translated "incorrect email or password," `auth/too-many-requests` to a translated rate-limit message, anything else to a generic error — never a raw Firebase error string); the staff schedule (rooms 1–6, date navigation via `DateNav`, a status badge per booking distinguishing active/expired holds from confirmed bookings, Room 6 always rendered as a "contact-only" note rather than an empty or broken row — no online Party checkout, no assumed session duration, as scoped); the owner overview (four count cards, no revenue/payment figures anywhere).
- **Routing** (`App.tsx`) restructured: `/staff/login` (public form), `/staff` (schedule — staff or owner), `/staff/overview` (owner only) — all still lazy-loaded per route, same as every other page. The old unauthenticated placeholder `routes/Staff.tsx` was deleted (superseded, not left dangling).
- **i18n** — a new `staff.*` namespace in both `en`/`si` (~50 keys). Several UI-chrome terms (`Email`, `Password`, `Sign In`, `Sign Out`, `Active Hold`/`Expired Hold`/`Confirmed`, room-status words) were deliberately kept as literal English in the Sinhala dictionary too, consistent with the site's existing code-switching style elsewhere (e.g. "staff", "booking" already appear untranslated in Sinhala copy) — this was a judgment call, not an oversight; the surrounding sentences and all headings/body text are properly translated.

#### Bug found and fixed during verification: emulator connection was never established for staff auth

The real-emulator E2E run initially failed every sign-in with a generic error. Root cause: `connectToEmulatorsIfConfigured()` (in `lib/firebase/client.ts`) was previously only ever invoked as a module-load side effect inside `data/index.ts` (Phase 3's booking-data barrel). None of this phase's new staff modules import `data/index.ts`, so `auth`/`functions` were being used against their default (non-emulator) configuration — Firebase Auth was silently trying to reach a real, nonexistent project. Fixed by adding the identical `if (DATA_MODE === "emulator") connectToEmulatorsIfConfigured();` guard (idempotent, safe to call from multiple modules) to both `hooks/useStaffAuth.ts` and `data/firebase/staffApi.ts`, so every staff Firebase entry point self-guarantees the emulator connection regardless of which page loads first. Caught by the real-browser test, not by typecheck/lint/unit tests — a reminder that this class of bug only surfaces under real integration testing.

#### Verification actually run

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | ✅ pass (booking-core, app, functions) |
| Lint | `npm run lint` | ✅ pass, 0 errors/warnings |
| Unit tests | `npm run test:unit` | ✅ 43/43 — unchanged from Phase 3 (this phase added no new pure-logic unit tests; all new coverage is integration-level, below) |
| Production build | `npm run build` | ✅ succeeds. New route chunks are small and separately lazy-loaded (`StaffLogin` ~0.7–1.8 kB, `StaffSchedule` ~3 kB, `OwnerOverview` ~2.3 kB, `staffApi` ~3–4 kB, `useStaffAuth` ~0.7 kB gzip); the pre-existing `dataMode` chunk (Firebase SDK, ~482 kB raw / ~143 kB gzip, flagged in Phase 3) is unchanged — this phase didn't make that regression worse, since it already paid for the Firebase SDK. |
| Functions build | `npm run build:functions` | ✅ succeeds |
| **Backend emulator + rules tests** | `npm run test:emulators` | ✅ **47/47** (Phase 3's 31 unchanged and still passing + 14 new in `staffAuth.emulator.test.ts` + 2 new rules assertions) |
| E2E, fixture mode | `npm run test:e2e` | ⚠️ 5/6 at the time — see "pre-existing time-of-day test limitation" below; unrelated to this phase. **Fixed in the Phase 4 patch below — now 6/6.** |
| **E2E, real emulator** | `npm run test:e2e:emulator` | ⚠️ 8/9 at the time — **all 8 new staff-auth tests pass**; the 1 failure is the same pre-existing time-of-day issue, in a Phase-3 test this phase didn't touch. **Fixed in the Phase 4 patch below — now 9/9.** |

**Every explicitly required verification scenario, and where it's proven:**

| Requirement | Result | Test |
|---|---|---|
| Guest cannot access staff or owner endpoints | ✅ `unauthenticated` from both callables | `staffAuth.emulator.test.ts` "unauthenticated callers are denied"; frontend: "an unauthenticated visitor sees a sign-in prompt" |
| Staff cannot access owner-only endpoints | ✅ `permission-denied` from `getOwnerOverview`, direct URL nav also denied | same file "staff role"; frontend: "staff can sign in... cannot reach the owner overview" |
| Role spoofing and direct client writes are rejected | ✅ `role: "owner"` in `request.data` has no effect; staff/owner-claimed tokens still denied all direct Firestore access | same file "sending role: 'owner' in request.data..."; `firestore.rules.test.ts` new staff/owner-claimed-token assertions |
| Owner and Staff can access their permitted views | ✅ both roles verified against both functions as appropriate | "staff role" / "owner role" blocks; frontend core-flow tests |
| Logout removes access | ✅ a call made after `signOut()` is rejected exactly like never having signed in | "logout revokes access"; frontend "signing out removes access to the schedule" |
| Holds and confirmed bookings remain distinct | ✅ an active hold, an expired (backdated) hold, and a directly-seeded confirmed booking each displayed with the correct, distinct status — never "confirmed" for a hold | "holds and confirmed bookings are never conflated in the staff schedule" (3 tests) |
| Existing booking concurrency/expiry tests still pass | ✅ all 19 of Phase 3's `inventory.emulator.test.ts` tests, unmodified, still pass | included in the 47/47 above |
| Production access is not used during tests | ✅ asserted `FIRESTORE_EMULATOR_HOST`/`FIREBASE_AUTH_EMULATOR_HOST` set, project id starts with `demo-` | "environment sanity" block, both new test files |

**Playwright viewport verification (explicit requirement — using real `test.use({viewport})`, not the broken Chrome DevTools resize tool):** `app/e2e/staffAuth.emulator.spec.ts` runs the core flows at desktop (1280×800), a dedicated 390×844 mobile pass (login form + schedule), a Sinhala desktop pass, and a Sinhala 390px pass — **all 8 of these tests pass**, genuinely exercising both breakpoints and both languages through a real Chromium instance (Playwright drives its own viewport via CDP directly, unlike the OS-level window resize the Chrome extension tool uses, which is why this works reliably here when the ad-hoc browser tool doesn't).

**Pre-existing time-of-day test limitation (not introduced by this phase, verified independently):** two tests — `app/e2e/smoke.spec.ts` "full booking wizard reaches a demo confirmation" (Phase 2) and `app/e2e/emulator.spec.ts` "creates a real hold..." (Phase 3) — click "Today" and expect at least one bookable slot. Business hours are 09:00–21:00 Colombo time with exactly 4 daily public start times (09:00/12:00/15:00/18:00). Verification for this phase ran at 15:42–18:31 Colombo time, past most or all of those start times, so zero slots for "today" remained clickable and both tests timed out waiting for a button that could never appear at that hour. This reproduces identically in fixture mode (deterministic hash, but "past" start times are always excluded regardless of hash) and in the real emulator (genuinely no future slot exists for today after closing), confirming it's a real, pre-existing gap in those two tests' design (they don't account for being run late in the business day), not a regression — neither test's file, nor `Book.tsx`, nor the fixture/emulator availability adapters were touched this phase. Re-running either suite earlier in the Colombo business day will pass as before.

**Update: fixed in the "Phase 4 patch" below** — both tests now pick a deterministic date/slot instead of depending on wall-clock time, and pass regardless of when they're run.

#### How to preview locally

```sh
# One-time (or to reset to a clean state): seed the catalog + both auth accounts
npm run seed:emulator   # now also seeds owner/staff auth accounts

# Terminal 1 — emulators (Auth + Firestore + Functions; add PATH if `java` isn't found —
# see "Environment notes" above)
npm run emulators:seeded

# Terminal 2 — the app, built against the real backend
VITE_DATA_MODE=emulator npm run dev --workspace app
```

Open the dev server URL, go to `/staff/login`, and sign in as either seeded account:
- Owner: `owner@apexcinema.test` / `LocalOwner!123` — sees the schedule (`/staff`) and can follow "Owner overview" to `/staff/overview`.
- Staff: `staff@apexcinema.test` / `LocalStaff!123` — sees the schedule only; `/staff/overview` shows "Access denied" even by direct URL.

Sign out via the "Sign Out" button in the top bar; the schedule/overview become inaccessible again immediately.

#### Files changed

`functions/src/{index,getStaffSchedule,getOwnerOverview}.ts` (new/edited), `functions/src/lib/{auth,schedule}.ts` (new), `functions/src/scripts/seedAuthUsers.ts` (new), `functions/tests/staffAuth.emulator.test.ts` (new, 14 tests), `functions/tests/firestore.rules.test.ts` (+2 assertions); `functions/package.json` (`seed:auth`); root `package.json` (`seed:auth` wired into `test:e2e:emulator`/`test:emulators`/`seed:emulator`); `app/src/hooks/useStaffAuth.ts` (new), `app/src/components/staff/{RequireRole,DateNav,StaffTopBar,scheduleFormat}.ts(x)` (new), `app/src/data/firebase/staffApi.ts` (new), `app/src/routes/staff/{StaffLogin,StaffSchedule,OwnerOverview}.tsx` (new), `app/src/routes/Staff.tsx` (deleted — superseded placeholder), `app/src/App.tsx` (routing), `app/src/i18n/translations.ts` (`staff.*`, both languages), `app/e2e/staffAuth.emulator.spec.ts` (new, 8 tests).

#### Known limitations / honest gaps

- **Owner MFA not implemented.** docs/SECURITY.md §5 requires it, but it needs Identity Platform + Blaze billing — explicitly gated behind approval per CLAUDE.md rule 3, and not part of this phase's itemized scope. Flagging here rather than silently skipping it.
- No cancellation, refund, extension, or manual-booking mutation exists yet — read-only dashboards only, as scoped. Room 6 (Party) always shows as contact-only with no bookings, since there's no mechanism yet to create one.
- No payment/financial data anywhere in the owner view — counts only, as scoped; not a placeholder for a revenue figure that's merely hidden.
- The login form's error mapping covers the common Firebase Auth error codes (`invalid-credential`, `user-not-found`, `wrong-password`, `invalid-email`, `too-many-requests`) plus a generic fallback for everything else — reasonable coverage, not an exhaustive enumeration of every possible Auth error code.
- Carried forward, unchanged from Phase 3: the `dataMode`/Firebase-SDK bundle-size tradeoff (~482 kB raw / ~143 kB gzip, present regardless of route since `data/index.ts` still statically imports both adapter sets); no scheduled/cosmetic expiry sweep (the staff schedule now *is* the view this note anticipated — it correctly recomputes a hold's live status on every read, so this is no longer a real gap, just noting the earlier note is now resolved).

### Phase 4 patch — verification & reliability fixes (before starting Phase 5)

**Status: done, verified 2026-09-20.** A focused patch requested before starting the next feature phase — no new features, no mutations, no deploy. Two things: (1) fix the two time-of-day-dependent browser test failures flagged at the end of Phase 4, and (2) close the emulator-isolation gap that caused the staff-auth bug found during Phase 4, structurally rather than with a one-off patch.

#### 1. Fixed the two failing booking browser tests

**Confirmed root cause** (re-verified, matches Phase 4's finding): `app/e2e/smoke.spec.ts`'s "full booking wizard" and `app/e2e/emulator.spec.ts`'s "creates a real hold" both clicked "Today" and grabbed the first slot labelled "available." Business hours are 09:00–21:00 Colombo time with exactly 4 fixed daily start times (09:00/12:00/15:00/18:00); a slot is excluded as "past" once its start time has gone by *today*, client-side in the fixture adapter and by definition in the real emulator (nothing can book a start time that's already gone). Run late enough in the Colombo business day — or after 21:00 — and zero slots for "today" remain clickable, so both tests hung until Playwright's timeout. Not flakiness: 100% reproducible at that hour, in both fixture and real-emulator mode.

**Fix — deterministic dates, not a fake clock.** New `app/e2e/testDates.ts` (not a test file itself — no `test()`/`describe()`, so Playwright's runner ignores it):
- `findDeterministicFixtureSlot(packageId, roomsTotal, startOffsetDays=5)` — replicates the fixture availability adapter's own hash algorithm (`app/src/data/fixtures/availabilityAdapter.ts`'s `hashToInt`/`statusFor`, kept byte-for-byte in sync) to compute, in advance, exactly which (date, time) pair will render as bookable — searching forward from `today + 5 days` (never "today," so the past-slot exclusion can never apply) until it finds one.
- `futureBusinessDate(offsetDays=5)` — for the real-emulator test: a freshly seeded/empty emulator run has zero existing bookings for any future date, so no hash is needed there — any slot on a future date is genuinely free by construction.
- Both use `addDaysToColomboToday` imported directly from `@apex-cinema/booking-core` — the exact same function the app itself uses for "today + N days" — so the computed date is always correct across month/year boundaries (it's relative day-arithmetic with a UTC-noon pivot, not a hardcoded string that could go stale) and works identically whether the suite runs at 9 AM or 11 PM.
- Both spec files now fill the wizard's native `<input type="date">` (`getByLabel("Or choose another date")`) with the computed `dateISO`, then click the button for the exact computed `time` — no more "click Today, hope something is available."

Considered and rejected: faking `Date`/`page.clock` in the browser. This app's date/time math (`getColomboTodayISO`, `getColomboMinuteOfDay`) runs in two different processes — the browser (fixture mode, and the wizard UI itself) and, for the real-emulator test, a separate Node Cloud Functions process whose own clock Playwright's browser-side clock injection cannot reach. Faking only the browser's clock would desync the UI's idea of "today" from the server's, breaking the emulator test in a different way. Picking dates that are simply never "today" sidesteps the whole problem without touching either clock, and satisfies "must work after closing time and across date/month/year boundaries" directly. Production past-slot validation (`endsWithinBusinessHours`, the `dateISO < todayISO` / `startMinute <= nowMinute` checks in `functions/src/lib/inventory.ts`) was **not touched**.

**Verified:** `npm run test:e2e` now **6/6** (was 5/6); `npm run test:e2e:emulator` now **9/9** (was 8/9). Re-ran each suite fresh (not just once) to confirm — see the verification table below.

#### 2. Emulator isolation review and fix

**Reviewed** every place `app/src/lib/firebase/client.ts`'s `auth`/`firestore`/`functions` exports are consumed: `data/index.ts` (customer booking adapters), `hooks/useStaffAuth.ts` (staff sign-in), `data/firebase/staffApi.ts` (staff/owner APIs), plus the three `data/firebase/{packagesAdapter,availabilityAdapter,holdsAdapter}.ts` files. Before this patch, the actual emulator *connection* (`connectAuthEmulator`/`connectFirestoreEmulator`/`connectFunctionsEmulator`) was each consumer's own responsibility — `data/index.ts` called `connectToEmulatorsIfConfigured()` itself, and Phase 4 added the same call to `useStaffAuth.ts` and `staffApi.ts` after the bug was found by hand. That's a per-module opt-in with no enforcement — exactly the shape of bug that already happened once and could happen again in any future module.

**Structural fix**: `lib/firebase/client.ts` now calls `connectToEmulatorsIfConfigured()` itself, automatically, at module load, whenever `DATA_MODE === "emulator"`. Every consumer already imports `auth`/`firestore`/`functions` from this one module to do anything with Firebase, so the connection is now guaranteed by construction — there is no longer a separate "did the caller remember to call it" step to forget. The now-redundant explicit calls were removed from `data/index.ts`, `hooks/useStaffAuth.ts`, and `data/firebase/staffApi.ts` (one source of truth, not four copies of the same guard).

**"Must fail clearly, never fall back to production"**: added a hard check inside `connectToEmulatorsIfConfigured()` — if `DATA_MODE === "emulator"` but `VITE_USE_FIREBASE_EMULATOR` has been explicitly set to `false` (a self-contradictory configuration: "use the real booking engine" but "don't point it at the local emulator"), the module **throws synchronously at import time** with an explicit message, instead of silently proceeding to use `env.firebase`'s configured project (which could be a real one, if ever set for a future deployment). This can't be missed — it fails before any route even renders. For the separate case of "the emulator is configured correctly but nothing is actually listening on localhost" (e.g. forgot to start `firebase emulators:start`): once `connect*Emulator()` has been called, the Firebase SDK's internal endpoints are redirected to the local host non-reversibly — a network failure there surfaces as a rejected promise (`auth/network-request-failed` and similar) on the actual call, which every call site already turns into a visible error state (a translated Notice, an inline form error) rather than silently succeeding or serving fixture data; it can never fall through to a real project, because the SDK was never pointed at one.

**Regression coverage** — new `app/src/lib/firebase/client.test.ts` (6 tests, mocks `firebase/{auth,firestore,functions,app}` and dynamically re-mocks `@/lib/dataMode`/`@/lib/env` per case via `vi.resetModules()`):
- connects all three (Auth/Firestore/Functions) to the emulator automatically when `DATA_MODE === "emulator"`;
- the emulator target is always `127.0.0.1`, never a configurable/real host;
- **the exact regression case**: merely importing the client module in emulator mode is sufficient to guarantee the connection — there is no separate step a future module could skip (this is what would have caught the original staff-auth bug);
- never touches the emulator in fixture mode;
- **fails loudly** (throws, and none of the `connect*Emulator` calls happen) when `DATA_MODE=emulator` but the emulator flag is off;
- `connectToEmulatorsIfConfigured()` stays idempotent when called again after module load.

No real Firebase project was connected to at any point — all of the above is either local-emulator-only (by construction, per the fix) or a mocked unit test with no network access at all.

#### 3. Verification actually run (each suite, separately, actual counts)

| # | Suite | Command | Result |
|---|---|---|---|
| 1 | Typecheck | `npm run typecheck` | ✅ pass (booking-core, app, functions) |
| 2 | Lint | `npm run lint` | ✅ pass, 0 errors/warnings |
| 3 | Production build (frontend) | `npm run build` | ✅ succeeds. Bundle sizes unchanged from Phase 4 (the Firebase-SDK chunk — now named `client` after the module that owns the connection logic, was `dataMode` — is ~482 kB raw / ~143 kB gzip, same pre-existing tradeoff, not worsened) |
| 4 | Production build (functions) | `npm run build:functions` | ✅ succeeds |
| 5 | Unit tests | `npm run test:unit` | ✅ **49/49** (21 booking-core + **28 app**, up from 22 — the 6 new `client.test.ts` regression tests) |
| 6 | Backend emulator + rules tests | `npm run test:emulators` | ✅ **47/47** — unchanged from Phase 4, confirms nothing in the centralization touched backend behavior |
| 7 | Browser tests, fixture mode | `npm run test:e2e` | ✅ **6/6** (was 5/6 — the booking-wizard fix, confirmed) |
| 8 | Browser tests, real emulator (booking + staff/owner) | `npm run test:e2e:emulator` | ✅ **9/9** (was 8/9 — the real-hold fix, confirmed; includes all 8 staff/owner tests from Phase 4, unchanged and still passing) |

**All 8 required suites are green. Nothing is being called "verified" while failing** — this patch does not ship until every one of the above passed on an actual run (not assumed), each re-run at least twice during this session to rule out a one-off pass.

#### Files changed

`app/e2e/testDates.ts` (new — shared, not a test file), `app/e2e/smoke.spec.ts` (deterministic date/slot in the booking-wizard test), `app/e2e/emulator.spec.ts` (same, for the real-hold test); `app/src/lib/firebase/client.ts` (centralized, self-guaranteeing emulator connection + hard-fail on contradictory config), `app/src/lib/firebase/client.test.ts` (new, 6 regression tests), `app/src/data/index.ts` / `app/src/hooks/useStaffAuth.ts` / `app/src/data/firebase/staffApi.ts` (removed now-redundant explicit `connectToEmulatorsIfConfigured()` calls); `docs/PROGRESS.md` (this entry, plus annotations on the original Phase 4 report pointing here).

#### Known limitations — unchanged from Phase 4, still incomplete on purpose

- **Owner MFA still not implemented** (docs/SECURITY.md §5) — needs Identity Platform + Blaze billing, gated behind explicit approval per CLAUDE.md rule 3. Not touched by this patch.
- **No payment/billing integration** — still no `confirmBooking`/PayHere work of any kind. Not touched by this patch.
- No cancellation, refund, extension, or manual-booking mutation — still read-only dashboards only, as scoped for this patch too (CLAUDE.md rule "no booking mutations... this patch").
- Not deployed; no production Firebase project was ever touched or configured.

#### How to preview locally (unchanged from Phase 4 — restated here for convenience)

```sh
# One-time (or to reset to a clean state): seed the catalog + both auth accounts
npm run seed:emulator

# Terminal 1 — emulators (Auth + Firestore + Functions). If `java` isn't found,
# see "Environment notes" at the top of this file for the PATH export.
npm run emulators:seeded

# Terminal 2 — the app, built against the real backend
VITE_DATA_MODE=emulator npm run dev --workspace app
```

Staff/owner sign-in routes: go to `/staff/login`.
- Owner: `owner@apexcinema.test` / `LocalOwner!123` → `/staff` (schedule) and `/staff/overview` (booking counts).
- Staff: `staff@apexcinema.test` / `LocalStaff!123` → `/staff` (schedule) only; `/staff/overview` shows "Access denied."

To run the fixed browser tests yourself: `npm run test:e2e` (fixture) and `npm run test:e2e:emulator` (real booking + staff/owner, requires Java on PATH for the emulators — see above).

### Dev-server blank-screen fix (before starting Phase 5)

**Status: done, verified 2026-09-20.** Local dev only — `http://localhost:5173` rendered a blank black page with a browser console error: `Uncaught SyntaxError: The requested module '/@fs/.../packages/booking-core/dist/index.js' does not provide an export named 'SLOT_TIMES' (at types.ts:26:10)`. Firebase emulators were already running; the production build (`npm run build` + `vite preview`) was unaffected — only `vite dev` broke. No new features; this patch only fixes the dev server.

#### Root cause

`app/src/data/types.ts:26` (`export { SLOT_TIMES } from "@apex-cinema/booking-core"`) and the booking-core source (`packages/booking-core/src/types.ts:80`, `export const SLOT_TIMES = [...]`, re-exported from `src/index.ts`) were both correct — the export genuinely exists in source. The problem was in how the **built** package gets served by Vite's **dev** server specifically:

- `packages/booking-core/package.json` has no `"type": "module"` field, and its `tsconfig.json` uses `"module": "nodenext"`. Under `nodenext`, TypeScript emits **CommonJS** for a package with no declared `"type"` — confirmed by inspecting `packages/booking-core/dist/index.js`, which is `"use strict"; ... exports.SLOT_TIMES = ...` via `Object.defineProperty` getters, not real `export` statements. This is deliberate, not a mistake: `functions/lib/index.js` (Cloud Functions' own compiled output, also CJS, also no `"type": "module"`) does `const booking_core_1 = require("@apex-cinema/booking-core")` — a synchronous `require()` that would throw `ERR_REQUIRE_ESM` at Cloud Functions runtime if booking-core were ever converted to real ESM.
- `@apex-cinema/booking-core` is an npm **workspace** package — `node_modules/@apex-cinema/booking-core` is a symlink to `../../packages/booking-core`. Vite's dev server treats symlinked ("linked") packages as part of the app's own source and serves their files directly via `/@fs/…`, **skipping esbuild's dependency pre-bundling** (`optimizeDeps`) that every other dependency (`firebase/*`, `react`, `lucide-react`, etc. — confirmed present in `app/node_modules/.vite/deps/`) goes through by default. Pre-bundling is exactly what performs CommonJS→ESM interop; without it, the raw CJS file is handed straight to the browser's native ES-module loader, which can't see `exports.SLOT_TIMES = …` as a named export — hence the exact error reported.
- Confirmed directly: `app/node_modules/.vite/deps/_metadata.json` had no entry for `booking-core` before the fix. This is why **production build worked and dev didn't** — Rollup (the build-time bundler `vite build` uses) does its own CJS interop unconditionally for every dependency it bundles, regardless of "linked" status; only Vite's *dev-server* pre-bundling step has this linked-package exemption.
- Ruled out: a stale `dist/` (rebuilt booking-core fresh, same CJS output — expected, not the bug) and a stale Vite cache alone (the cache didn't just need clearing — it was *correctly* reflecting that booking-core had never been included; clearing it without the config fix would reproduce the identical error on the next dev-server start).

#### Fix

One change, in `app/vite.config.ts`: added `optimizeDeps: { include: ["@apex-cinema/booking-core"] }`. This forces esbuild to pre-bundle the package on every `vite dev` start despite it being a linked workspace package, giving it the same CJS→ESM interop treatment every other dependency already gets — matching what Rollup already did for the production build. Nothing in `packages/booking-core` or `functions` was touched:

- **booking-core stays CommonJS** (no `"type": "module"`, no `.js`-extension rewrite of its relative imports) — still loads correctly via Cloud Functions' `require()`, still the single source of truth for `SLOT_TIMES` and every other shared constant. Not duplicated in the frontend.
- **Considered and rejected**: adding `"type": "module"` to `packages/booking-core/package.json` to make it "genuinely ESM" (arguably more idiomatic for `nodenext`). Rejected because it would (a) break `functions/lib/index.js`'s `require("@apex-cinema/booking-core")` at runtime (`ERR_REQUIRE_ESM` — Node cannot synchronously `require` an ES module), and (b) require adding explicit `.js` extensions to every relative import across `packages/booking-core/src/*.ts` (nodenext ESM mandates them) — a much larger, riskier change than the task's "smallest durable fix" called for, and a real risk to Cloud Functions compatibility that the task explicitly said to avoid.
- **No dist files were hand-edited.** `packages/booking-core` was rebuilt via its normal `npm run build` (`tsc`) — the fix is entirely in Vite config, not generated output.

#### What was rebuilt / restarted (emulators untouched)

- `npm run build --workspace packages/booking-core` — fresh `dist/`, unaffected in content by this fix (still CJS, as intended).
- Cleared `app/node_modules/.vite` (the stale pre-bundle cache, which had never known about `booking-core`) and restarted **only** the Vite dev server (`npm run dev --workspace app`, and separately with `VITE_DATA_MODE=emulator` for the emulator-mode check below). The already-running Firebase Emulator Suite (Auth/Firestore/Functions, started earlier with `--import=./emulator-data --export-on-exit=./emulator-data`) was **never stopped, restarted, or reseeded** — confirmed still running throughout (same PID before and after).

#### Verified in the actual Vite dev server (not just the production build)

Browser-checked at `http://localhost:5173` (dev server, `VITE_DATA_MODE=emulator`), via Chrome automation — screenshots, console, and direct `fetch()` calls from the page's own context:

- **Home (`/`)** renders fully (hero, nav, logo) — no blank screen, no console errors, `SyntaxError` gone.
- **Booking page (`/book`)** renders fully, including the package cards computed from `@apex-cinema/booking-core`'s `PACKAGE_CATALOG`/`SLOT_TIMES` — the exact code path that was broken. No console errors.
- **Staff login (`/staff/login`)** renders fully; the sign-in form is interactive and submits to the real Auth emulator (verified both through the UI and directly: `fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/...')` from the page returned a genuine Identity-Toolkit-shaped response). See note below on why sign-in itself didn't succeed.
- **Emulator mode connects only to local services**: confirmed `DATA_MODE === "emulator"` in the running page; direct `fetch()` calls from the page context to `http://127.0.0.1:9099` (Auth), `http://127.0.0.1:8080` (Firestore), and `http://127.0.0.1:5001` (Functions) all succeeded — all three on `127.0.0.1`, none elsewhere. A real Firebase project would reject the app's `demo-api-key`/`demo-apex-cinema` config outright; getting a coherent emulator-shaped response is itself proof this never reaches a real backend.
- **Note, not a bug**: signing in as `staff@apexcinema.test` against this specific long-running emulator instance returned `EMAIL_NOT_FOUND` (confirmed via a direct REST call to the Auth emulator) — this persisted emulator session (loaded from `./emulator-data`) apparently doesn't currently have the seeded staff/owner accounts. Per this task's explicit instruction not to reseed the running emulators, this was left as-is and **not** treated as part of the bug being fixed — the connection itself is proven correct. Run `npm run seed:auth` yourself (safe, non-destructive, documented) against this session if you want to test an actual staff sign-in.

#### Verification actually run

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | ✅ pass (booking-core, app, functions) |
| Lint | `npm run lint` | ✅ pass, 0 errors/warnings |
| Production build (frontend) | `npm run build` | ✅ succeeds, bundle sizes unchanged |
| Production build (functions) | `npm run build:functions` | ✅ succeeds |
| Unit tests | `npm run test:unit` | ✅ 49/49 (21 booking-core + 28 app, unchanged) |
| Browser tests, fixture mode | `npm run test:e2e` | ✅ 6/6 |
| Dev server, manual browser check | (see above) | ✅ Home/Book/Staff-login all render; emulator-only connectivity confirmed |

Backend emulator/rules tests (`npm run test:emulators`) and the emulator-mode Playwright suite (`npm run test:e2e:emulator`) were **deliberately not run** this time — both internally start their own `firebase emulators:exec` session on the same ports (9099/8080/5001) the user's long-running emulator instance already occupies, which would conflict with or interfere with it. Nothing backend-related changed in this patch (Cloud Functions, Firestore rules, and business logic were untouched), so this is not a coverage gap for what actually changed — see the previous "Phase 4 patch" entry for the last full run of those suites (47/47 and 9/9 respectively), unaffected by this change.

#### Exact preview URL and commands

```sh
# Firebase emulators — already running for this session; left untouched.
# (If starting fresh: npm run emulators:seeded, from repo root.)

# Frontend dev server — restart with:
VITE_DATA_MODE=emulator npm run dev --workspace app
```

Preview URL: **http://localhost:5173/** — Home, `/book`, `/staff/login` all confirmed rendering. Staff/owner sign-in routes unchanged: `/staff/login`, `/staff` (schedule), `/staff/overview` (owner-only counts) — credentials as documented above, once `npm run seed:auth` has been run against whichever emulator session you're using.

#### Files changed

`app/vite.config.ts` (added `optimizeDeps.include`) — the only source change. `docs/PROGRESS.md` (this entry). No changes to `packages/booking-core`, `functions`, or any generated `dist`/`lib` output.

### Phase 5 — Staff/Owner manual bookings (local emulators only)

**Status: done, verified 2026-09-20 (Node mismatch noted below).** Implements Phase 4's proposed item 5b, scoped down exactly as this phase's brief specified: standard rooms 1–5 only (Non-AC/AC Small/AC Large), no Party, no cancellation/extension/payment work.

#### Manual-reservation semantics (explicit, per this phase's brief)

A manual booking created by Staff or Owner is a **confirmed room reservation with `paymentStatus: "unpaid"`**. Booking confirmation is not payment confirmation — no money has been collected, recorded, or even asked about. `paymentStatus` is a fixed value written once at creation; there is no edit path for it this phase (see docs/DECISIONS.md D14). This mirrors CLAUDE.md rule 6 ("keep booking status and payment status as separate state machines") literally: `bookingStatus: "confirmed"` and `paymentStatus: "unpaid"` are two independent fields on the same doc, never conflated. Out of scope, explicitly not built: payment collection/recording, editing `paymentStatus`, deposits, refunds, cancellation, extensions, and Party (Room 6) bookings of any kind.

#### Backend (`functions/src`)

- **`createManualBooking`** (new) — Staff or Owner only (`requireRole(request, ["staff", "owner"])`, checked *before* touching the request body). Reuses `functions/src/lib/inventory.ts`'s exact transactional inventory pattern via a new `createManualBookingTransactional` in the same file — same `findFreeRoom`/`isActive`/`minutesOverlap` functions `createHold` already uses, so manual reservations and online holds share one real inventory and can never disagree about room occupancy (a manual booking and a guest hold racing for the last room in a single-room tier resolve exactly the way two guest holds would). Differences from `createHoldTransactional`, all intentional: writes `bookingStatus: "confirmed"` directly (no pending-hold stage) with a `confirmed` interval (`holdExpiresAtMillis: null`), which — because `isActive()` already treats `"confirmed"` as permanently active — means a manual reservation can never expire the way an online hold does; writes `paymentStatus: "unpaid"`; records `createdBy` (the actor's uid) and `source` (`"staff_walkin"` | `"staff_phone"`, matching the values docs/ARCHITECTURE.md §3 already anticipated); and writes one `auditLog` entry in the same transaction (`actorUid`, `action: "manual_booking_created"`, `targetType`, `targetId`, `roomId`, `dateISO`, `source`, server timestamp — deliberately **no customer name/phone/email**, per docs/SECURITY.md §8). Idempotency uses its own `manualBookingIdempotency` collection (not `holdIdempotency`) with a fingerprint that includes `actorUid`, so a valid replay only ever matches the same staff/owner account resubmitting its own attempt with the same key and payload.
- **`lib/validation.ts`**'s new `validateManualBookingRequest` mirrors `validateHoldRequest`'s strictness (same package/date/time/capacity/phone checks, reusing `validateBookablePackageId` — which already excludes Party) with two differences: email is optional, and a required `source` (`"staff_walkin"` | `"staff_phone"` only — no `"staff_party"` this phase).
- **`lib/schedule.ts`**'s `ScheduleBooking` gained an optional `paymentStatus` field (`null` for online holds/bookings, which don't write it yet) — read-only, purely for the staff schedule's "Unpaid" badge; no other behavior changed.
- **`packages/booking-core`**'s shared `PaymentStatus` type gained `"unpaid"` (docs/DECISIONS.md D14) — additive, the existing online-payment states (`initiated`/`pending`/`succeeded`/...) are untouched.
- **`firestore.rules`** — added explicit deny blocks for the two new collections (`manualBookingIdempotency`, `auditLog`), matching the existing per-collection pattern (the file's catch-all already denied them; explicit rules are for clarity/defense-in-depth, same reasoning as every other collection here). No collection needed a new *allow* — every staff/owner read/write still goes through a Cloud Function.

#### Frontend (`app/src`)

- **`routes/staff/NewManualBooking.tsx`** (new route, `/staff/new-booking`, Staff or Owner via `RequireRole`) — a two-phase flow (`form` → `review` → `success`) in one page, not a multi-page wizard: fill the form, click "Review booking" to see the summary (package, date, start–end time, people, price, customer, source, note, and a **"Payment not recorded — unpaid"** notice) exactly as required, then "Confirm booking". On success, shows the reference code, assigned room, and payment status. A generated `idempotencyKey` (fresh per review, stable across retries of the same review) is sent with the request; on any error the form/review state is left completely untouched — nothing is cleared — so a slot that became unavailable between browsing and submitting can be fixed (pick another time) without retyping customer details.
- **`components/staff/ManualBookingForm.tsx`** — package (3 radio cards, reusing the same catalog/adapter as the customer wizard), date (quick-pick Today/Tomorrow + native date input, `min`/`max` bounded to the booking window), start time (the 4 fixed slots only, live-checked against real availability via the existing `getAvailability` adapter so staff see available/limited/full before submitting — full/past slots are disabled, exactly like the customer wizard), people count (bounded to the selected package's `maxPeople`), customer name/phone (required) and email (optional), source (walk-in/phone), and an optional short staff note. Every field uses the existing `Field`/`Input`/`Label` components for consistent accessible labeling; client-side validation (`lib/manualBookingValidation.ts`) mirrors the server's rules for immediate feedback, the server re-validates everything regardless (docs/ARCHITECTURE.md §2).
- **`components/staff/ManualBookingReview.tsx`** — the review summary + the required unpaid notice + Confirm/Edit-details buttons, with a Notice-based error slot for the unavailable/invalid/conflict/unknown states.
- **`routes/staff/StaffSchedule.tsx`** — added a "+ New manual booking" link next to the date navigator, and an "Unpaid" badge next to the status badge on any booking row with `paymentStatus === "unpaid"`. The schedule already refetches on every date change via its existing `usePromise`, so a newly-created manual booking appears automatically the moment staff land back on `/staff` — "Back to schedule" on the success screen navigates to `/staff?date=<the booked date>` specifically so this happens without any extra clicking, even if the booking was for a future date.
- **Bug found and fixed during this phase's own verification**: `ManualBookingForm` originally fetched the package catalog itself (its own `usePromise(() => packagesAdapter.listPackages(), [])`), duplicating the parent route's identical fetch. Two independent network calls to the same `getPackages` function occasionally raced — a fast (or scripted) submit could hit "Review booking" before the *parent's* copy of the list had resolved, silently falling back to `maxPeople: 1` for validation and rejecting a valid people count. Fixed by fetching the catalog once in the parent route and passing it down as a prop — not just a test workaround, a real duplicate-fetch race a fast human user could have hit too. Caught by the new Playwright test, not by typecheck/lint/unit tests.

#### Verification actually run

**Environment note (Node mismatch, as requested):** this machine runs Node **v26.5.0**; the project's Cloud Functions target (`functions/package.json` `engines.node`) is **22**. Same pre-existing, already-documented mismatch as every prior phase (see README "Known limitations") — it only matters at actual deploy time, not for local emulator development, and nothing about it changed this phase.

| # | Suite | Command | Result |
|---|---|---|---|
| 1 | Typecheck | `npm run typecheck` | ✅ pass (booking-core, app, functions) |
| 2 | Lint | `npm run lint` | ✅ pass, 0 errors/warnings |
| 3 | Production build (frontend) | `npm run build` | ✅ succeeds |
| 4 | Production build (functions) | `npm run build:functions` | ✅ succeeds |
| 5 | Unit tests | `npm run test:unit` | ✅ 49/49 (21 booking-core + 28 app — unchanged; this phase added no new pure-logic unit tests, all new coverage is integration-level, below) |
| 6 | **Backend emulator + rules tests** | isolated-port run (see below) | ✅ **75/75** — see "Verification completion" below for the corrected, audited breakdown (the counts first written here were wrong) |
| 7 | Browser tests, fixture mode | `npm run test:e2e` | ✅ 6/6, unaffected |
| 8 | **Browser tests, real emulator** | isolated-port run (see below) | ✅ **12/12** at the time this phase was first reported (now 13/13 — see "Verification completion" below) |
| 9 | Dev server (not just production build) | manual check, live preview emulator, read-only | ✅ `/staff` shows the new "+ New manual booking" link; `/staff/new-booking` renders the full form with real catalog data, no console errors. **Not submitted**, to avoid writing test data into your running preview's saved emulator data. |

**Every explicitly required test scenario, and where it's proven** (all in `functions/tests/manualBooking.emulator.test.ts` unless noted):

| Requirement | Result |
|---|---|
| Guests and no-role users are rejected | ✅ `unauthenticated` / `permission-denied`, incl. `role: "owner"` tampering in the payload having no effect |
| Staff and Owner can create valid manual reservations | ✅ both roles, confirmed/unpaid, server-assigned room, correct price |
| Role, price, capacity, date, Party tampering rejected | ✅ tampered `totalAmountMinor` ignored (server recomputes); over-capacity, past date, non-public time, `packageId: "party"`, and an unknown `source` value all rejected |
| Manual booking vs. online hold for the last matching room | ✅ each direction tested (online-first blocks manual, manual-first blocks online) *and* a true concurrent race (`Promise.allSettled`) resolves to exactly one winner |
| Simultaneous manual requests cannot overbook | ✅ 2 concurrent requests on a 1-room package → exactly 1 succeeds; 4 concurrent on a 3-room package → exactly 3 succeed |
| Expired holds release capacity; adjacent sessions valid | ✅ a backdated online hold's slot becomes bookable again by a manual request; two adjacent manual sessions on the same single room both succeed |
| Retry creates one booking, one audit event | ✅ exact-key-and-payload retry returns the identical booking (checked via a direct Firestore query — exactly 1 booking doc, exactly 1 audit doc); same key with a different payload is rejected (`already-exists`), never silently served |
| Failed operations leave no partial writes | ✅ a sold-out attempt leaves the inventory interval count and the audit-log document count both unchanged |
| Manual reservations remain occupied beyond 10 minutes | ✅ direct Firestore check: the interval has `status: "confirmed"`, `holdExpiresAtMillis: null` — contrasted against a real online hold on an adjacent slot, backdated 15 minutes, which *does* release, proving the manual booking's permanence isn't just "hasn't expired yet" |
| Public responses expose no customer details | ✅ `getAvailability` after a manual booking scanned for the customer's name/phone/`bookingId` — none present; response shape unchanged (`time`/`status`/`roomsFree`/`roomsTotal` only) |
| Direct client writes remain denied | ✅ `firestore.rules.test.ts` — new assertions for `manualBookingIdempotency` and `auditLog`, including with a **staff/owner-claimed** token (defense-in-depth, matching the existing pattern for `bookings`/`inventory`) |

**Playwright browser verification (`app/e2e/manualBooking.emulator.spec.ts`, 4 tests, real Playwright `test.use({viewport})` — desktop 1280×800, mobile 390×844):** the full form→review→confirm flow at desktop, ending with the created booking visible on `/staff` (time, customer name, "Unpaid" badge, "Confirmed" status badge) *and* the same date/package/time now showing as a disabled ("full") slot on the public `/book` wizard — proving the staff-created booking actually blocks public availability, not just that it appears on the schedule; the same flow at 390px; and a Sinhala-locale render check of the form.

#### Isolated emulator test infrastructure (new, reusable)

The backend and browser test suites above needed the local Firebase Emulator Suite, but your preview emulator was already running on the default ports with your own saved data — reusing it (or its ports) was off-limits this phase. Added:

- **`firebase.test.json`** — a second emulator config, ports offset from the defaults (Auth 9199, Firestore 8180, Functions 5101, plus isolated hub/logging/eventarc/tasks ports). Never touched by any existing script; only used when explicitly passed via `--config`.
- **`functions/tests/testEmulatorPorts.ts`** (new, not a test file — no `describe`/`it`) — the 4 backend emulator test files now read their target ports from `TEST_AUTH_EMULATOR_PORT`/`TEST_FIRESTORE_EMULATOR_PORT`/`TEST_FUNCTIONS_EMULATOR_PORT` env vars, defaulting to the real ports (9099/8080/5001) unchanged — so `npm run test:emulators`/`test:e2e:emulator` behave exactly as before when no override is set.
- **`app/src/lib/env.ts`**'s `env.emulatorPorts` — same idea for the frontend build: `VITE_FIREBASE_EMULATOR_{AUTH,FIRESTORE,FUNCTIONS}_PORT`, defaulting to 9099/8080/5001. `app/src/lib/firebase/client.ts` now reads these instead of a hardcoded constant.
- **`TEST_PROJECT_ID`** (also in `testEmulatorPorts.ts`, default `"demo-apex-cinema"`) — **required**, not just the ports. Firebase's emulator hub coordinates same-project-id instances via a locator keyed by project id, independent of port config; running two `firebase emulators:exec`/`emulators:start` instances for the same project id prints "running multiple instances... this may result in unexpected behavior" and, confirmed by direct testing, is not just a warning — client SDK calls can silently reach the *other* instance regardless of distinct ports. An isolated run therefore needs `--project demo-apex-cinema-test` (or any other `demo-`-prefixed id) as well as its own ports.
- **A second, real bug found via this same investigation**: `firebase emulators:exec` (used by the normal `test:emulators`/`test:e2e:emulator` scripts) was unreliable specifically for a *second, isolated* instance in this environment — tests failed almost instantly with `auth/user-not-found` even with correct env vars and a fully separate project id, while the exact same seed+test commands run directly against an `emulators:start`-launched background instance (no `exec` wrapper) passed 75/75 every time. Root cause not fully isolated (likely a timing/readiness race specific to `exec`'s process-wrapping in this sandboxed environment); the reliable workaround — start in the background, poll for "All emulators ready", seed and test as plain commands, then stop the process — is what every verification run above actually used. Flagged here rather than left as an unexplained flake; the default (non-isolated) `test:emulators`/`test:e2e:emulator` scripts are untouched and still use `emulators:exec` as before.

#### How to preview locally (unchanged routes/credentials from Phase 4)

```sh
npm run seed:emulator                          # one-time (or reset): catalog + owner/staff auth accounts
npm run emulators:seeded                       # terminal 1
VITE_DATA_MODE=emulator npm run dev --workspace app   # terminal 2
```

Sign in at `/staff/login` as Owner (`owner@apexcinema.test` / `LocalOwner!123`) or Staff (`staff@apexcinema.test` / `LocalStaff!123`). From `/staff`, click **"+ New manual booking"** (or go directly to `/staff/new-booking`) to record a walk-in or phone reservation.

**To run this phase's new tests yourself against an isolated, non-conflicting emulator** (safe to run alongside a separately-running preview on the default ports):

```sh
# Terminal 1 — isolated emulators (own ports + own project id)
export PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"   # if java isn't found — see Environment notes above
firebase --config firebase.test.json --project demo-apex-cinema-test emulators:start --only auth,firestore,functions
# wait for "All emulators ready!"

# Terminal 2 — seed, then run the backend suite
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8180 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9199 GCLOUD_PROJECT=demo-apex-cinema-test
export TEST_PROJECT_ID=demo-apex-cinema-test TEST_AUTH_EMULATOR_PORT=9199 TEST_FIRESTORE_EMULATOR_PORT=8180 TEST_FUNCTIONS_EMULATOR_PORT=5101
npm run seed:emulator --workspace functions && npm run seed:auth --workspace functions
npm run test --workspace functions

# Then the browser suite (same terminal/env), against a build pointed at the isolated ports
VITE_DATA_MODE=emulator VITE_FIREBASE_EMULATOR_HOST=127.0.0.1 \
VITE_FIREBASE_EMULATOR_AUTH_PORT=9199 VITE_FIREBASE_EMULATOR_FIRESTORE_PORT=8180 VITE_FIREBASE_EMULATOR_FUNCTIONS_PORT=5101 \
VITE_FIREBASE_PROJECT_ID=demo-apex-cinema-test npm run build --workspace app
cd app && npx playwright test --grep @emulator

# When done, stop the isolated emulator (Ctrl-C / kill the process from terminal 1) — your
# separately-running preview emulator and its ./emulator-data are never touched by any of this.
```

#### Files changed

`functions/src/createManualBooking.ts` (new), `functions/src/index.ts` (export), `functions/src/lib/{inventory,reference,schedule,validation,firestore}.ts` (edited; `auth.ts` unchanged), `functions/tests/manualBooking.emulator.test.ts` (new, 26 tests), `functions/tests/testEmulatorPorts.ts` (new), `functions/tests/{ping,inventory,staffAuth,firestore.rules}.emulator.test.ts` (port/project-id parameterized only — test counts otherwise unchanged; firestore.rules.test.ts +2 assertions, 12→14), `packages/booking-core/src/types.ts` (`PaymentStatus` +`"unpaid"`); `firestore.rules` (+2 explicit deny blocks); `app/src/routes/staff/NewManualBooking.tsx` (new), `app/src/components/staff/{ManualBookingForm,ManualBookingReview}.tsx` (new), `app/src/lib/manualBookingValidation.ts` (new), `app/src/data/firebase/staffApi.ts` (createManualBooking + types + paymentStatus field), `app/src/routes/staff/StaffSchedule.tsx` (new-booking link, Unpaid badge, `?date=` query param), `app/src/App.tsx` (route), `app/src/i18n/translations.ts` (`staff.manualBooking.*` + `staff.newBookingLink`/`staff.unpaidBadge`, both languages), `app/src/lib/env.ts` + `app/src/lib/firebase/client.ts` (isolated-port env overrides), `app/src/lib/firebase/client.test.ts` (mock updated for the new `emulatorPorts` field); `app/e2e/manualBooking.emulator.spec.ts` (new, 3 tests — desktop/390px/Sinhala) plus 1 more added in the verification-completion pass below (conflict/race); `app/e2e/functionsEmulator.ts` (new, verification-completion pass); `firebase.test.json` (new); `docs/ARCHITECTURE.md`, `docs/DECISIONS.md` (this phase's additions). **Test-count reconciliation for this "Files changed" line and the report below it is in the verification-completion pass — see there for the exact, audited numbers; the counts originally written when this phase was first reported were wrong (see that pass for why).**

#### Known limitations / honest gaps

- No cancellation, extension, payment collection, or Party manual entry — all explicitly out of scope this phase, as instructed.
- ~~The "preserve entered details when a slot becomes unavailable" requirement... wasn't independently exercised by an automated browser test this phase~~ — **closed in the verification-completion pass below**: a dedicated real-race browser test now exists and passes.
- ~~The root cause of `firebase emulators:exec` being unreliable for a second, isolated instance... wasn't fully diagnosed~~ — **still not root-caused**, but no longer just "worked around once": the `emulators:start`-in-background approach was used consistently across every run in the verification-completion pass too (backend and browser, multiple fresh restarts), so it's a confirmed-reliable substitute, not a one-off. If the *default*-port `test:emulators`/`test:e2e:emulator` scripts (which still use `emulators:exec`, unmodified) ever show the same symptom, that would need fresh investigation — they haven't been observed to.
- ~~Node mismatch (v26.5.0 vs. the project's target 22)~~ — **addressed in the verification-completion pass below**: an unlinked `node@22` keg now exists on this machine specifically so Node-22 verification runs are possible without changing the linked/global `node`. See that section for an important caveat: fixing an unrelated breakage this caused did end up changing the global `node` version (not intentionally, not to a different major version).
- Carried forward, unchanged: the `client`/Firebase-SDK bundle-size tradeoff from Phase 3 (~482 kB raw / ~143 kB gzip); Owner MFA still not implemented (needs Identity Platform + Blaze billing approval).

#### Verification completion pass (2026-09-20, after the phase above was first reported)

Requested before committing: reconcile the test-count numbers above (they didn't add up), re-run the manual-booking-relevant builds/tests under the project's target Node 22, and add a real regression test for a staff/owner conflicting with another request for the last matching room mid-submission. All three below; nothing else in the phase above changed (no feature work).

**1. Test-count reconciliation — the numbers above were wrong; here is the audited, correct breakdown.**

Compared every test file byte-for-byte against `main` (`git diff main -- <file>`) to get exact, verifiable counts rather than re-estimating:

| | Backend (`functions/tests`) | Browser (`app/e2e`) |
|---|---|---|
| **Baseline on `main`** (before this phase) | 47 — `ping.unit`:1, `ping.emulator`:1, `inventory.emulator`:19, `staffAuth.emulator`:14, `firestore.rules`:12 | 9 — `emulator.spec`:1, `staffAuth.emulator.spec`:8 |
| **Changed this phase** | `firestore.rules.test.ts` +2 assertions (12→14); new `manualBooking.emulator.test.ts` file, **26** tests (not "14" as originally reported — that number was simply wrong, possibly confused with `staffAuth`'s own count of 14). `ping.emulator`/`inventory.emulator`/`staffAuth.emulator` were **not** modified in test count or behavior — `git diff` against `main` shows only a `testEmulatorPorts.ts` import + `TEST_PROJECT_ID`/`EMULATOR_PORTS.*` substituted for hardcoded `"demo-apex-cinema"`/port literals, nothing else. | New `manualBooking.emulator.spec.ts` file, **3** tests (desktop / 390px / Sinhala) — not "4" as originally reported (that "+1" was a stray, uncounted-for padding artifact, not a real fourth test at the time). `emulator.spec.ts`/`staffAuth.emulator.spec.ts` are **byte-identical** to `main` (`git diff` empty) — genuinely untouched. |
| **New total** | 47 + 26 + 2 = **75** ✅ matches the reported figure | 9 + 3 = **12** ✅ matches the reported figure (at the time) |

So the *totals* (75 and 12) were correct — only the prose describing how they were reached ("14 new", "4 new") was wrong. No test was modified to make a number match; the reconciliation above is a read of what already existed. One pre-existing test (`manual reservations never expire > remains occupied...`) *was* rewritten mid-phase — not to hit a count, but because its original version raced two requests for the same single-room package/date/time against each other, making the second request fail for an unrelated reason (a real bug in the test's own design, not the feature); it still counts as 1 of the 26, unchanged in count, corrected in behavior — see the file's own comment for the before/after.

This section's own new test (§3 below) adds one more to each: backend stays at 75 (no new backend test was needed — the scenario is inherently a browser-level race between two real HTTP requests around a UI submission), browser goes **12 → 13**.

**2. Verification under Node 22 (the project's actual target).**

This machine's linked/global Node was v26.5.0 (functions/package.json targets **22**). To get a real Node 22 without relinking or replacing the global install, installed the `node@22` Homebrew formula, which is **keg-only by design** — Homebrew does not symlink it into `/opt/homebrew/bin` when another `node` is already linked, and it wasn't force-linked. Verified: `brew install node@22` printed "was installed but not linked because node is already linked", and immediately after, `which node` still resolved to the pre-existing linked keg.

**Important, unintended side effect — reported in full rather than omitted:** installing `node@22` upgraded a shared dependency (`simdutf`) that an *unrelated* already-installed Homebrew package (`merve`, a small CommonJS-export-lexer library that Node's own tooling depends on) was dynamically linked against. Immediately after, the linked/global `node --version` started crashing (`dyld: Library not loaded ... libsimdutf.34.dylib`, exit code 134) — a real, if narrow, disruption to the global Node installation that was not requested and is called out here rather than left unmentioned. The only fix was `brew upgrade merve`, which Homebrew cascaded into also upgrading the linked `node` formula itself (**26.5.0 → 26.9.0** — a patch-level bump within the same major version, not a downgrade, not a major-version change, and not something that was asked for or intended). The old 26.5.0 keg was removed by Homebrew's own cleanup step as part of that upgrade, so an exact revert back to 26.5.0 isn't cleanly possible after the fact. Confirmed afterward: global `node --version` → `v26.9.0`, exits cleanly; `node@22` → `v22.23.2`, exits cleanly; the running preview's Firebase emulator (PID unchanged) and Vite dev server (PID unchanged) were never restarted or otherwise affected by any of this — a live process doesn't need to reload a shared library it already has open.

With `node@22`'s bin directory placed first on `PATH` for these commands specifically (never exported globally/persistently — this repo's `.zshrc`/shell profile was not touched):

- `npm run build --workspace packages/booking-core` and `npm run build --workspace functions` — ✅ succeed under `node --version` → `v22.23.2`.
- The isolated Functions emulator's own log line changed from every prior run's `⚠ functions: Your requested "node" version "22" doesn't match your global version "26". Using node@26 from host.` to **`✔ functions: Using node@22 from host.`** — confirming the emulator process itself, not just the CLI wrapping it, now runs the functions under Node 22.
- The backend test runner (`npx vitest run` inside `functions/`) — confirmed via an inline `console.log(process.version)` immediately before invoking it in the same shell — also resolved to **v22.23.2**.
- Full backend suite re-run fresh under this configuration: **75/75**.
- Frontend build (`npm run build --workspace app`, `VITE_DATA_MODE=emulator`) and the full emulator-mode Playwright suite were also run with `node@22` first on `PATH` (Playwright's own orchestration process is Node; the actual browser automation itself runs in Chromium, unaffected by Node version either way) — **13/13** (see §3).

**3. New regression test — a real conflict between a staff submission and a competing request for the last matching room.**

Added `app/e2e/manualBooking.emulator.spec.ts` › **"a competing request takes the last matching room between review and confirm — staff sees a conflict, keeps their details, and retries successfully on another slot"** (`app/e2e/functionsEmulator.ts`, new, builds the direct callable-HTTP URL used to fire the competing request):

1. Staff fills the manual-booking form for **AC Small** (room-4 — the package's *only* physical room, so any competing booking for the same date/time unambiguously takes "the last matching room") and reaches the review step.
2. While still on review (before clicking Confirm), the test fires a **real, separate HTTP request** directly at the `createHold` callable's emulator endpoint (Playwright's `request` fixture, bypassing the UI entirely) — a genuine competing guest hold for the identical package/date/time, not a mock or simulated response.
3. Staff clicks **Confirm** — asserts the actual server-returned conflict message is shown (`"That room is no longer available for this date and time — pick another slot. Your details have been kept."`), and explicitly asserts **no false success**: `getByText("Booking confirmed")` and the `APX-` reference pattern both have `toHaveCount(0)`.
4. Asserts the customer's name is still visible right there on the review screen (nothing was cleared by the failed submission), then clicks "Edit details" and asserts the name/phone **form inputs** still hold their original values.
5. Picks a different, uncontended time (12:00) on the same package, reviews, and confirms again — asserts this one **actually succeeds**: a real "Booking confirmed" status, a real `APX-` reference, the correct room.

Result: ✅ **passed on the first run**, and again on the final fully-fresh combined run below — no code changes were needed to make it pass; it validates behavior the implementation already had (the catch block in `NewManualBookingBody.handleConfirm` never touches `form` state), but this is now machine-verified rather than only reasoned through.

**Final combined re-run, fully fresh (isolated emulator stopped and restarted clean, re-seeded, before each), under Node 22 throughout:**

| Suite | Result |
|---|---|
| Backend emulator + rules tests (`functions`) | ✅ **75/75** |
| Browser tests, real emulator (`app/e2e`, `--grep @emulator`) | ✅ **13/13** (12 from before + the 1 new conflict/race test) |
| Typecheck / Lint | ✅ pass (re-run after adding the new spec + helper file) |

Isolated emulator processes were stopped cleanly after every run (confirmed via `ps`/port checks); the running preview emulator (PID unchanged throughout this entire pass) and its `./emulator-data` were never imported from, exported to, or otherwise touched. Synthetic test data only (`Race Condition Test` / `Competing Guest`, fictional phone numbers, dates 20+ days out) — none of it reached the preview's saved data.

**Remaining limitations after this pass:**
- The `firebase emulators:exec`-unreliable-for-a-second-instance issue is still not root-caused (see above) — a confirmed-reliable workaround, not a fix.
- The unintended global Node patch-version bump (26.5.0 → 26.9.0, described in full above) cannot be cleanly reverted — flagging for your awareness, not attempting a further change to fix it without being asked.
- Same feature-scope limitations as before this pass: no cancellation/extension/payment/Party.

#### Bug-fix pass (2026-09-20, after the verification-completion pass above): blank Package area on `/staff/new-booking`

**Reported symptom** (from screenshots of the running preview): the "Package" label appeared with no selectable packages beneath it; "Tomorrow" was a valid selected date; "Start time" stayed on "Choose a package and date first."; clicking through to review showed "Choose a package." / "Choose a start time." with no way to ever select a package.

**Investigation, in the order actually done:**
1. Found the live preview's emulator supervisor process had died (only an orphaned Firestore-only process remained; Auth/Functions were both unreachable). Restored it via `npm run emulators:seeded`, re-importing the *same* `./emulator-data` (verified unchanged before/after: same `roomTiers` catalog, same 0 bookings) — a restore of a crashed process, not a reset. Re-seeded only the two staff/owner **auth** accounts (missing because the saved `auth_export` snapshot predates when they were originally created) via the existing `seedAuthUsers.js` script — idempotent, touches only those two accounts, never Firestore.
2. Confirmed the catalog was **not** missing: `roomTiers` has all 4 correct docs (3 standard + Party) with correct prices/capacities/`isBookableOnline` flags — ruling out a data problem before touching anything.
3. Confirmed `functions/src/getPackages.ts` and `app/src/data/firebase/packagesAdapter.ts` are both simple, correct, and unmodified — ruling out the backend/adapter.
4. Reproduced the healthy path twice (full page load and SPA client-side navigation to `/staff/new-booking`) — **packages rendered correctly both times**, disproving "always broken" and disproving a timezone bug (per your explicit instruction not to assume one — date/time logic was never involved in the actual cause).
5. Root cause found by reading `app/src/routes/staff/NewManualBooking.tsx`: `usePromise(() => packagesAdapter.listPackages(), [])` was destructured as `const { data: packages } = usePromise(...)` — **`loading` and `error` were discarded**. Every *other* `usePromise` call site in the app (`Home.tsx`, `Packages.tsx`, `DateTimeStep.tsx`) reads and renders `loading`/`error`; this was the only one that didn't. Confirmed live: patched `window.fetch` in the running preview's browser tab to reject only the `getPackages` call (a real rejected promise, not a mock UI state) — the page rendered a bare "Package" label with **zero** radio options, **zero** console output, **zero** error UI, exactly reproducing every symptom in the report (Start time stuck on "choose a package and date first", Review blocked with "Choose a package."/"Choose a start time."). This is consistent with the emulator-down state found in step 1: any failed/unavailable `getPackages` call — Functions emulator down, a slow cold start, a transient network error — hits this same silent path.

**Fix** (`app/src/routes/staff/NewManualBooking.tsx`, `app/src/components/staff/ManualBookingForm.tsx`, `app/src/i18n/translations.ts`):
- `NewManualBookingBody` now reads `loading`/`error` from the packages `usePromise` (previously discarded), plus a `packagesRetryKey` state included in its dependency array so a retry can re-run the fetch without remounting the route or touching any other state.
- `ManualBookingForm` renders three explicit states in the Package section instead of the previous single always-empty-or-full fieldset: **loading** ("Loading packages…"), **error** (translated message + a "Try again" button), **empty** (packages loaded but zero bookable ones — same "Try again" affordance, in case the catalog is transiently misconfigured), and only then the normal package cards.
- "Review booking" is now `disabled` whenever packages are loading, errored, or empty (mirrors the existing `DateTimeStep`/public-booking convention of disabling "Continue" under the same conditions) — `handleReview()` also short-circuits defensively for the same condition, so review can never be reached with an unusable package list.
- Customer-entered fields (name/phone/etc.) live in the parent's `form` state, untouched by the packages retry — verified live (see below), not just by code reading.
- New translation keys (`staff.manualBooking.packagesLoading`/`packagesErrorBody`/`packagesEmptyBody`) added to **both** `en` and `si`; the existing `common.retry` ("Try again" / "නැවත උත්සාහ කරන්න") key is reused for the button. `npm run test --workspace app` includes the i18n parity check (both dictionaries typed against the same shape) — still passes.
- Party remains excluded (unchanged — `ManualBookingForm` still filters to `isBookableOnline`); availability slots (09:00/12:00/15:00/18:00, Asia/Colombo) are unchanged — this bug was entirely in the packages fetch, not availability.

**Manually verified live in your running preview** (no data written — `Confirm booking` was never clicked): with `getPackages` patched to fail, the Package section showed the translated error + "Try again" instead of a blank area; "Start time" showed the existing "choose a package and date first" copy; "Review booking" was confirmed `disabled` via a direct DOM check. Typed a customer name/phone during the failure, clicked "Try again" — packages loaded (all 3 standard packages, correct prices, Party excluded), and the typed name/phone were still there. Continued through package → Tomorrow → all 4 slots showing "Available" (Asia/Colombo) → people count → "Review booking" → reached the real review screen with the correct price/date/time/customer details. Repeated the loading-state check in Sinhala (`Package load කරමින්…` visible momentarily on a fresh load) — did not exhaustively re-run the full Sinhala flow interactively (relied on the automated Sinhala regression test + i18n parity check for that language, both passing) after an unrelated browser-automation quirk (a stale element reference on one click) made further manual Sinhala clicking unreliable; not a product issue — no console errors, no app misbehavior were observed.

**New regression test** — `app/e2e/manualBooking.emulator.spec.ts` › **"a failed packages fetch shows an explicit error with Retry — never a silently blank Package area — and Retry recovers the flow without losing entered details"**: routes (Playwright `page.route`) the *first* `getPackages` call to `route.abort("failed")` — a real aborted request, not a mocked UI state — then asserts the translated error text and "Try again" are visible, zero package radios exist, "Choose a package and date first." still shows for Start time, "Review booking" is disabled; fills customer name/phone, clicks "Try again", asserts packages now render and the typed details survived; completes the full package → slot → review flow and asserts the review screen shows the correct customer name. Backend: no new backend test needed — this bug and fix are entirely frontend (the failure path is a client-side fetch rejection, not a server behavior change).

**Test results — isolated emulator (own ports + `demo-apex-cinema-test` project id, per the established `emulators:start`-in-background workflow), single fully-fresh pass, all env vars held in one shell throughout:**

| Suite | Result |
|---|---|
| Backend (`functions`) | ✅ **75/75** — unchanged, this bug/fix never touched backend code |
| Browser, real emulator (`app/e2e --grep @emulator`) | ✅ **14/14** (13 from before + the 1 new packages-fetch-failure test) |
| `npm run typecheck` (booking-core + app + functions) | ✅ pass |
| `npm run lint` (root `eslint .`) | ✅ pass |
| `npm run test:unit` (booking-core: 21, app: 28 — includes i18n parity) | ✅ **49/49** |
| `npm run build` (booking-core + app) and `npm run build:functions` | ✅ both succeed |

One self-inflicted false alarm during this pass, reported for transparency: re-running the suite in **separate** shell invocations without re-exporting `TEST_PROJECT_ID`/`TEST_FUNCTIONS_EMULATOR_PORT` in each one caused the conflict/race test's direct HTTP call to silently fall back to the *default* (non-isolated) project/port — i.e., it would have hit your live preview's Functions emulator, not the isolated one. Checked immediately: the request was cleanly rejected (non-2xx) before writing anything — a direct read of the live preview's `holds`/`bookings`/`manualBookingIdempotency`/`holdIdempotency`/`auditLog` collections via the Firestore emulator's REST API confirmed 0 documents in every one, matching the pre-existing state. Re-ran with all env vars held in a single shell for the rest of this pass; no further occurrences. The isolated emulator was stopped after every run (confirmed via port checks); the running preview emulator and its `./emulator-data` were never imported from, exported to, or otherwise touched by this entire pass.

**Known limitations / honest gaps after this pass:**
- The "empty" package state (catalog loads successfully but has zero bookable packages) is implemented and translated but has no dedicated automated test — only the loading/error/retry path (the actually-reported bug) has one. Worth a follow-up test if the catalog's `isBookableOnline` flags are ever expected to change at runtime.
- Manual interactive verification of the new states in Sinhala was partial (see above) — the automated Sinhala regression test and the i18n parity check both pass, but the loading/error/retry states specifically were not interactively re-verified in Sinhala beyond the momentary loading-state check.
- No code outside this bug's actual cause was touched — availability, review, confirm, and the conflict/race path are all unchanged and still pass their existing tests.

#### Follow-up fix (2026-09-21): the test-isolation fallback disclosed in the bug-fix pass above

The bug-fix pass above disclosed, as a "self-inflicted false alarm," that `app/e2e/functionsEmulator.ts`'s `callableUrl()` silently defaulted `TEST_PROJECT_ID`/`TEST_FUNCTIONS_EMULATOR_PORT` to the live preview's own project id (`"demo-apex-cinema"`) and port (`5001`) whenever they weren't explicitly exported in the shell running Playwright — so a forgotten `export` in one of several separate shell invocations pointed the conflict/race test's direct HTTP call at whatever was actually listening on those coordinates (in that case, the live preview emulator itself). The request was rejected that time and nothing was written, but nothing in the code prevented it from succeeding. Requested before committing: eliminate the fallback entirely, require explicit validated isolated configuration, fail before any network request, and prove it.

**What was inspected first:** `app/e2e/functionsEmulator.ts` (the disclosed file) and everything it depends on for isolation — `playwright.config.ts` (serves `app/dist`, built with `VITE_FIREBASE_*` baked in at `vite build` time — a **separate** source of truth from `functionsEmulator.ts`'s `TEST_*`, read fresh from `process.env` at Playwright run time, set via a **separate** shell command per the documented runbook), and `functions/tests/testEmulatorPorts.ts` (the backend suite's equivalent port/project reader).

**Root cause, precisely:** `callableUrl()` used `process.env.TEST_PROJECT_ID ?? "demo-apex-cinema"` and `process.env.TEST_FUNCTIONS_EMULATOR_PORT ?? "5001"` — by design, so the same helper could serve both the manual isolated workflow (with `TEST_*` set) and the automated `test:e2e:emulator` root script (`firebase emulators:exec` with no `--config`/`--project` override, which spins up an ephemeral instance on those exact same default coordinates and tears it down after). Those two "default" cases are **not the same thing** — one is a safe, ephemeral, exclusively-owned instance; the other is the developer's always-on live preview — but the code couldn't tell them apart, and nothing distinguished "config omitted on purpose for the ephemeral-exec flow" from "config omitted by mistake while a live preview happens to be listening on the identical coordinates."

**Fix — `app/e2e/isolatedEmulatorConfig.ts` (new):**
- `getIsolatedEmulatorConfig()` reads `TEST_PROJECT_ID` + `TEST_AUTH_EMULATOR_PORT`/`TEST_FIRESTORE_EMULATOR_PORT`/`TEST_FUNCTIONS_EMULATOR_PORT` from `process.env` with **zero fallback of any kind** — every one of the four is required, or it throws synchronously, before returning anything.
- Beyond "missing," it actively rejects values that *are* the live preview's own known coordinates: `TEST_PROJECT_ID === "demo-apex-cinema"` is rejected outright (not just when defaulted — explicitly setting it to that value is rejected too, since the danger is the coordinate, not how it was set); each port matching its corresponding preview port (9099/8080/5001) is rejected the same way; `TEST_PROJECT_ID` must match `/^demo-[a-z0-9-]+$/` (a real, if minimal, "is this even an emulator-safe id" check); the three ports must be mutually distinct.
- `assertLoopbackEmulatorUrl(url, expectedPort)` parses the constructed URL and asserts `http:` + `127.0.0.1`/`localhost` + the exact expected port — an explicit, testable assertion on the endpoint actually being loopback, not just an assumption baked into a template string.
- `callableUrl()` (`functionsEmulator.ts`) calls the validator first; if it throws, the function never returns a URL, so a caller's `request.post(callableUrl(...), ...)` never evaluates its second argument or performs any request — "fail before any network request" is a direct consequence of synchronous-throw-before-return, not a separate mechanism that could itself have a gap.

**"Ensure the test helper and browser test configuration target the same isolated environment":** the two sources of truth (`TEST_*` read by Node at test-run time; `VITE_FIREBASE_*` baked into the build at build time) genuinely cannot be statically unified across two separate shell commands without merging those commands into one (out of scope — that's the existing documented two-step runbook, "do not change global tooling"). Added `assertPageTargetsIsolatedFunctions(page)` instead: a **runtime** proof, wired into the conflict/race test (`manualBooking.emulator.spec.ts`), that waits for the first real Functions-emulator request the *browser page itself* makes and asserts its URL matches the exact project id + port `callableUrl()` computed from `process.env` — i.e., it proves both sides actually agree in that specific run, not just that each one independently looks valid.

**A second, real bug found and fixed while adding tests for this:** the new Vitest unit tests live in `app/e2e/isolatedEmulatorConfig.test.ts` (Node environment, not jsdom) — but `app/e2e/**` was entirely excluded from Vitest's config (`exclude: ["e2e/**"]`, added when `app/e2e/*.spec.ts` were introduced, to keep Vitest from trying to load Playwright's own test files). Narrowed `vite.config.ts`'s test `include`/`exclude` to `e2e/**/*.test.ts` / `e2e/**/*.spec.ts` respectively so the two runners' files are unambiguously separated by suffix. This alone would have let **Playwright** pick up the new `*.test.ts` file too (its default glob matches `*.test.ts` *and* `*.spec.ts`) — confirmed by `npx playwright test --list` actually failing with "Vitest failed to find the runner" while trying to load `isolatedEmulatorConfig.test.ts`, which would have broken `npm run test:e2e`/`test:e2e:emulator`. Fixed by adding `testMatch: /.*\.spec\.ts$/` to `playwright.config.ts`, scoping it to its own existing naming convention. Re-verified after: `npx playwright test --list` → the same 20 tests across the same 4 `.spec.ts` files as before, 0 errors.

**`functions/tests/testEmulatorPorts.ts` was deliberately left unchanged.** It has the same-shaped `?? "demo-apex-cinema"` / `?? 8080` etc. fallback, but it is **not** the same hazard: it's read by the backend Vitest suite, whose two legitimate flows are (a) `emulators:exec`-wrapped (`test:emulators`/`test:e2e:emulator`), where the default coordinates are safe *by construction* — `emulators:exec` spins up its own ephemeral instance on those ports for the command's duration only, and if a live preview is already bound to those same ports, `emulators:exec` fails to start at all (`EADDRINUSE`) rather than silently reusing the preview — and (b) the same manual isolated workflow, where the runbook already requires exporting `TEST_PROJECT_ID`/`TEST_*_PORT` (unchanged, still required, now doubly appropriate). Unlike `app/e2e/functionsEmulator.ts` — which has **no** legitimate default-only use case at all, since it's exclusively used to fire direct HTTP requests from a bare `npx playwright test` invocation outside any `emulators:exec` wrapper — `testEmulatorPorts.ts`'s fallback is load-bearing for a real, safe, unchanged flow. Making it strict too would have meant either breaking `test:emulators`/`test:e2e:emulator` outright or editing those root scripts to pass matching env vars — both out of scope ("do not change global tooling"; the request named `functionsEmulator.ts` and "the isolated test setup" specifically, matching the incident actually disclosed).

**Direct, disclosed consequence for `test:e2e:emulator`:** the root `test:e2e:emulator` script's `firebase emulators:exec` call (no `--config`/`--project` override) provisions an ephemeral instance on the exact same coordinates as the live preview (`demo-apex-cinema` / 9099 / 8080 / 5001) and never exports `TEST_*`. Before this fix, the conflict/race test "worked" there only because its defaults happened to numerically match that ephemeral instance. After this fix, running `npm run test:e2e:emulator` as-is will make that one test fail immediately with a clear `IsolatedTestConfigError` ("Isolated test configuration is missing TEST_PROJECT_ID…") instead of silently succeeding against coordinates that are indistinguishable, by code, from the live preview's. This is the correct behavior per the explicit instruction ("never default to the preview project's ID or its emulator ports" has no carve-out for this flow) but it is a real, intentional behavior change to that script's outcome, flagged here rather than fixed silently — fixing it would mean passing `firebase.test.json`-equivalent isolated coordinates through that script too, which touches root tooling and wasn't requested.

**Focused tests added — `app/e2e/isolatedEmulatorConfig.test.ts` (22 tests, Vitest, Node environment):**
- *Missing/invalid configuration → zero network requests, fails before any request*: every `TEST_*` var missing (individually and all-at-once); `TEST_PROJECT_ID` not `demo-`-prefixed; `TEST_PROJECT_ID` equal to the live preview's own id; each port individually equal to the live preview's own port; malformed ports (`0`, `-1`, non-numeric, out-of-range, non-integer); colliding isolated ports. Each case asserts both the specific thrown error **and** that a `globalThis.fetch` spy recorded zero calls; one case also asserts `callableUrl()` throws *synchronously* (not a rejected Promise), matching how the real test calls it as `request.post(callableUrl(...), ...)` — a synchronous throw during argument evaluation means `request.post` is never reached at all.
- *Valid isolated configuration works*: a fully valid, preview-distinct config (`demo-apex-cinema-test` / 9199 / 8180 / 5101, matching `firebase.test.json`) round-trips through `getIsolatedEmulatorConfig()` to the exact expected shape and through `callableUrl()` to the exact expected loopback URL string; a second distinct `demo-`-prefixed id is also accepted (proving the check is "not the preview," not "must be this one literal string").
- `assertLoopbackEmulatorUrl` tested directly: accepts `127.0.0.1`/`localhost` + matching port; rejects a non-loopback host, `https:`, and a mismatched port.

**Verification — Node 22 process-scoped (`/opt/homebrew/opt/node@22/bin` prefixed on `PATH` for these commands only; global `node` untouched):**

| Check | Result |
|---|---|
| `npx vitest run e2e/isolatedEmulatorConfig.test.ts` (Node 22) | ✅ **22/22** |
| `npx vitest run` — full app unit suite (Node 22) | ✅ **50/50** (49 from before + these 22, minus none removed — 7 files total; confirms the new `include`/`exclude` split picked up exactly the one new file, nothing else) |
| `npm run typecheck` (booking-core + app + functions) | ✅ pass |
| `npm run lint` (root `eslint .`) | ✅ pass |
| `npx playwright test --list` | ✅ 20 tests / 4 files — unchanged from before this fix; confirms the Vitest file is correctly excluded from Playwright's own collection |
| Full isolated-emulator pass: backend | ✅ **75/75** |
| Full isolated-emulator pass: browser (`--grep @emulator`, valid `TEST_*` set) | ✅ **14/14** — including the conflict/race test now running through `assertPageTargetsIsolatedFunctions`'s live consistency check, and the packages-fetch-failure test from the pass above |
| **Negative-path proof, live**: same conflict/race test, `TEST_*` deliberately `unset` in the shell | ✅ fails in **961ms** with `IsolatedTestConfigError: Isolated test configuration is missing TEST_PROJECT_ID... No network request was made.` — confirmed via the live preview's `holds`/`bookings` collections (Firestore emulator REST API): 0 documents in both, before and after this run |

Isolated emulator stopped after every run (confirmed via port checks). The live preview emulator was confirmed healthy (auth/firestore/functions all responding) and untouched throughout — never imported from, exported to, reset, or reseeded.

**Known limitations / honest gaps after this fix:**
- ~~`test:e2e:emulator` will now fail-fast on the conflict/race test when run as-is... not fixed here~~ — **fixed in the checkpoint pass immediately below**, since the user clarified editing this repo's `package.json` scripts and local test config is authorized (only machine-wide Node/Homebrew setup is "global tooling").
- `functions/tests/testEmulatorPorts.ts` still has a permissive default, kept deliberately (see above) — if its own safe-by-construction assumption (`emulators:exec` always fails to bind already-occupied preview ports) is ever found to not hold in some environment, it would need the same treatment.
- No product code changed — this entire fix is confined to `app/e2e/*` (test-only files) and `app/vite.config.ts`/`app/playwright.config.ts` (test-runner glob scoping).

#### Checkpoint (2026-09-21): `test:e2e:emulator` fixed to supply consistent isolated config, committed, pushed, PR opened

The fix above deliberately left `npm run test:e2e:emulator` broken-as-disclosed (it never exported `TEST_*`, so it would now fail-fast rather than silently reuse the preview's coordinates) because fixing it meant editing root `package.json`/adding a script, which the previous instructions' "do not change global tooling" left ambiguous. Clarified this session: editing this repo's own `package.json` scripts and local test configuration is in scope — "global tooling" means the machine's Node/Homebrew setup, not this repository's own npm scripts.

**Fix — `scripts/test-e2e-emulator-isolated.sh` (new) + `package.json`'s `test:e2e:emulator` now just runs it:**
- Defines the isolated project id (`demo-apex-cinema-test`) and ports (9199/8180/5101, matching `firebase.test.json`) in exactly one place, and exports them as both `TEST_*` (for `app/e2e/isolatedEmulatorConfig.ts`) and the standard Admin SDK vars (`FIRESTORE_EMULATOR_HOST`/`FIREBASE_AUTH_EMULATOR_HOST`/`GCLOUD_PROJECT`, for the seed scripts) — so the emulator instance, the seed scripts, the built browser app, and the Playwright test helpers can no longer drift apart across separate shell invocations, which was the root cause of the original incident.
- Does **not** use `firebase emulators:exec` (what the old script and `test:emulators` use) — per the standing, already-documented finding in this same file ("isolated emulator test ports": `emulators:exec` was found unreliable specifically for a second, isolated instance in this environment, failing almost instantly with `auth/user-not-found` even with fully correct config). Uses the confirmed-reliable substitute instead: `emulators:start` in the background, a readiness poll (up to 120s, checking both "All emulators ready" in the log and that the process is still alive), then seed/build/test as plain foreground commands.
- `trap cleanup EXIT INT TERM` stops **only the exact PID this script itself started** (tracked via `$!`, `kill -0` liveness-checked before signalling) — never a broad pattern match that could also match the live preview's own `firebase emulators:start ... --import=./emulator-data` process. Runs unconditionally on success, failure, or interrupt.
- Auto-detects Java (needed by the Auth/Firestore emulators, not linked onto `PATH` by default on this machine) and adds `openjdk@21`'s bin directory to `PATH` **for this script's own subprocess only** if a working `java` isn't already resolvable — never exported globally, never touches the shell profile. If no working Java can be found at all, fails immediately with a clear message rather than silently proceeding.
- Never imports from, exports to, resets, or reseeds `./emulator-data` (the live preview's persisted data) — the isolated instance is always started with no `--import`/`--export-on-exit` flags, an entirely separate, ephemeral instance.

**Scope of the change:** `package.json` (`test:e2e:emulator` now `bash scripts/test-e2e-emulator-isolated.sh`, one line), `scripts/test-e2e-emulator-isolated.sh` (new), `README.md` (updated the script's description in the scripts table to match). `test:emulators` (backend-only) is untouched — it still uses `emulators:exec` with no isolation, which remains safe for the reasons already documented above (its default-port instance fails to start at all if the preview is already bound to those ports, rather than silently colliding with it).

**Verification — exact documented command, process-scoped Node 22, zero manual environment setup:**

```sh
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"   # the only PATH change made from outside the script
npm run test:e2e:emulator
```

No other env var was set by hand before this command — everything the script needs (`TEST_*`, the Admin SDK vars, `VITE_FIREBASE_*` for the app build, and Java's `PATH` entry if needed) is set inside the script itself.

| Check | Result |
|---|---|
| `npm run typecheck` (booking-core + app + functions) | ✅ pass |
| `npm run lint` (root `eslint .`) | ✅ pass |
| `npm run test:unit` (booking-core: 21 + app: 50, Node 22) | ✅ **71/71** |
| `bash -n scripts/test-e2e-emulator-isolated.sh` | ✅ no syntax errors |
| **`npm run test:e2e:emulator`** (exact command, Node 22, no manual env setup) | ✅ **14/14** — builds core+functions, starts the isolated instance, seeds it, builds the app against it, runs the full `@emulator` Playwright suite, then stops the isolated instance automatically |
| Isolated ports (9199/8180/5101) after the run | ✅ confirmed free — the script's own cleanup stopped its emulator process |
| Live preview (auth 9099 / firestore 8080 / functions 5001) before vs. after | ✅ unchanged — all three still responding, healthy |
| Live preview `holds`/`bookings` collections, before vs. after | ✅ unchanged — 0/0 both times (direct Firestore-emulator REST read) |
| `./emulator-data/` file timestamps, before vs. after | ✅ unchanged (`Sep 20 13:53`, untouched) |

**Diff review before committing:** read the full `git status`/`git diff` for every file about to be staged. Grepped for API keys, secrets, tokens, and private-key markers — the only matches were the pre-existing, already-established synthetic local-emulator test credentials (`LocalStaff!123`, `LocalOwner!123`, `TestPass!12345`, `apiKey: "demo-api-key"`) used throughout the existing test suite for a `demo-`-prefixed, offline-only emulator project — never real credentials. No `.env`/credential/key files staged. Confirmed `app/dist`, `functions/lib`, `emulator-data`, and `node_modules` all stay gitignored and were not part of the diff. No customer data anywhere — only synthetic test fixtures (already the established convention in every existing `@emulator` test).

**Committed, pushed, PR opened** — commit `7ca1130` on `feature/staff-manual-bookings` (covers this phase's full manual-bookings feature plus both bug-fix passes above — a single checkpoint commit, consistent with this repo's existing phase-level commit granularity), pushed to `origin/feature/staff-manual-bookings`, PR opened into `main`: https://github.com/Madushan186/apex-cinema/pull/1. Not merged (per instruction) — awaiting review.

**Known limitations / honest gaps after this checkpoint:**
- `test:emulators` (backend-only, `emulators:exec`, unisolated) remains untouched, as before — not in scope, still considered safe for the documented reason.
- The `emulators:exec`-unreliable-for-isolated-instances root cause is still not diagnosed, only reliably worked around (unchanged from before).
- This PROGRESS.md update itself landed in a small follow-up commit after the main checkpoint commit (`7ca1130`), rather than being folded into it — noted here rather than silently amending an already-pushed commit.

### Phase 6 — Manual-booking cancellation (local emulators only)

**Status: done — implemented, automated-verified, and owner-verified locally, 2026-09-21.** Implements the cancellation half of Phase 5's proposed item 6b, scoped down exactly as this phase's approved brief specified: unpaid manual bookings for standard rooms 1–5 only, staff/owner (no owner override for started bookings), no payment/refund change. Extension approval and Party manual entry (the rest of 6b) remain future work.

Branch: `feature/manual-booking-cancellation`, cut from verified `main` (post-PR-#1 merge commit `e4784dd`) — the previous phase's work is untouched, this branch adds only cancellation.

#### Approved rules (given verbatim, not engineering defaults)

- Staff and Owner may cancel confirmed, unpaid manual bookings for standard rooms 1–5 only.
- Cancellation is allowed only before the session starts, checked using server time and the Asia/Colombo booking date/time.
- A non-empty, length-limited cancellation reason is required.
- No Owner override for started bookings in this phase.
- Online holds, paid bookings, and Party bookings are out of scope.
- Cancellation does not change payment status or issue refunds.

See `docs/DECISIONS.md` D15 for the full recorded decision (supersedes/narrows D10's original proposal — no owner-override capability is built yet, tracked as still-open in item #6).

#### Backend (`functions/src`)

- **`cancelManualBooking`** (new callable) — Staff or Owner only (`requireRole`, checked before touching the request body, same order as every other privileged function here). Delegates to a new `cancelManualBookingTransactional` in `lib/inventory.ts`, which reuses this file's exact per-room/per-date inventory-doc + transaction pattern (docs/ARCHITECTURE.md §6: "every future inventory-changing operation... must go through this same doc + transaction pattern") — cancellation reads the booking doc and its inventory doc inside one `runTransaction`, all reads before any write, exactly like `createHoldTransactional`/`createManualBookingTransactional`.
- **Eligibility, all re-checked server-side inside the transaction** (never trusted from the client, never only checked once before the transaction opens): booking exists (`not-found` otherwise); `bookingStatus === "confirmed"`; `source` is `"staff_walkin"` or `"staff_phone"` (excludes online holds/bookings and any future `"staff_party"` — checked directly rather than inferred from `bookingStatus` alone, so this stays correct even once a future phase teaches online bookings to reach `"confirmed"` too); `paymentStatus === "unpaid"` (checked explicitly, not just assumed true, so this doesn't silently widen once a future phase adds payment recording); the package's `isBookableOnline` is true (excludes Party/room-6, same check `createManualBookingTransactional` already uses); and the session's start time hasn't passed yet, computed from the server's own Asia/Colombo clock (`getColomboTodayISO()`/`getColomboMinuteOfDay()`) — the identical rule `createHoldTransactional`/`createManualBookingTransactional` already use for rejecting past-dated requests, just inverted. Any failed check throws `failed-precondition` (or `not-found`) *before* any write is staged.
- **Idempotency without a new collection.** Unlike booking creation (which creates a new random-id resource and needs an idempotency-key → cached-response table to detect a retry), cancellation is a state transition on an *existing* document — "has this already happened" is exactly "is `bookingStatus` already `\"cancelled\"`," checked as the very first thing inside the transaction, after the booking read. An already-cancelled booking returns the original cancellation's result unchanged (no new write, no new audit entry, no repeated inventory release) regardless of what `reason` a later call sends — the first cancellation's reason always wins. This also makes Firestore's own transaction-retry-on-conflict do the concurrency-safety work for free: two truly simultaneous cancel calls both read the booking as `"confirmed"`, one commits first, the other's transaction is retried by Firestore (its read became stale), re-reads the now-`"cancelled"` booking fresh, and takes the no-op branch — proven by a real `Promise.allSettled` concurrent-call test, not just reasoned through (see below).
- **Only this booking's own interval is released.** The inventory doc's `intervals` array is updated via `.map()`, replacing only the entry whose `bookingId` matches — every other interval on that room/date (including a different booking's session later the same day) is left byte-for-byte untouched. A missing interval (an internal data-consistency anomaly, not a normal rejection) throws `internal` rather than silently no-op'ing.
- **Booking history is preserved, never deleted.** The transaction uses `transaction.update()` (not `.set()`) on the booking doc, adding `bookingStatus: "cancelled"`, `cancelledAtMillis`, `cancelledBy`, and `cancellationReason` — every original field (customer name/phone/email, price, source, `createdBy`, etc.) is untouched. `paymentStatus` is deliberately never written by this function at all.
- **Audit trail with a real before/after diff** — the first audit entry in this codebase that's an *edit*, not a creation (every prior entry, `manual_booking_created`, had no meaningful diff to record). `docs/SECURITY.md` §8 already specified audit entries should carry a before/after diff "with any secrets/PII redacted"; this is the first operation where that requirement actually applies. The diff is structural only (`{bookingStatus: "confirmed"} → {bookingStatus: "cancelled"}`) — the reason text and every customer detail are deliberately excluded, following the exact precedent `staffNote` already set (staff-authored free text lives on the booking doc, never duplicated into `auditLog`).
- **`lib/validation.ts`**'s new `validateCancelManualBookingRequest` checks only shape/presence (a plausible `bookingId` string, a non-empty reason ≤500 chars) — every actual eligibility rule is checked server-side inside the transaction anyway (it has to read the booking doc regardless), so duplicating those checks in the validator would just be a second place for them to drift.
- **`lib/schedule.ts`**'s `ScheduleBooking`/`getBookingsForDate` gained two read-only fields: `source` (so the staff UI can cosmetically decide which rows to offer a cancel action on) and `cancellationReason` (shown, once cancelled, as part of that booking's preserved history); `DisplayStatus` gained `"cancelled"`, derived the same way every other status already is (from the stored `bookingStatus`, never rewriting the doc just to display it correctly).
- **`firestore.rules`** — unchanged. No new collection was introduced (cancellation only touches `bookings`/`inventory`/`auditLog`, all three already fully client-denied), so no new rules were needed.

#### Frontend (`app/src`)

- **`components/staff/CancelBookingDialog.tsx`** (new) — a confirmation dialog (booking summary: package, room, date, time, customer; a required, length-bounded reason field; Keep-booking/Confirm-cancellation actions) shown from an eligible schedule row. Client-side reason validation mirrors the server's ("required" only — the server is still the actual boundary); a rejection from the server (already-started, already-cancelled by someone else in the meantime, network error) is shown as a normal inline error state, dialog stays open, nothing is lost.
- **`components/ui/dialog.tsx`** (new) — a thin wrapper around the native `<dialog>` element (`showModal()`/`close()`), not a new dependency (no `@radix-ui/react-dialog` in this repo) and not a custom focus-trap implementation — `showModal()` gives real browser-native focus trapping, Escape-to-close, and focus restoration on close for free, in every evergreen browser. Supports an `initialFocusRef` so the reason field is focused as soon as the dialog opens, focused in the *same effect* that calls `showModal()` (calling it from a child component's own effect would run too early — React fires child effects before parent effects, so `showModal()` might not have happened yet; documented in the component itself as the reason this isn't just done the "obvious" way).
- **`components/ui/textarea.tsx`** (new) — same visual/interaction style as the existing `Input`, for the multi-line reason field.
- **`components/staff/scheduleFormat.ts`**'s new `isCancelEligible(booking, scheduleDateISO)` mirrors `cancelManualBookingTransactional`'s eligibility rule exactly, for deciding which rows show the Cancel action — explicitly documented as cosmetic only, never the actual control (docs/SECURITY.md §3: "UI hiding of buttons is cosmetic only and never the actual control") — the server re-checks everything regardless. `STATUS_BADGE_VARIANT` gained a `cancelled: "negative"` entry (the existing `Badge` component's red/negative status color, already used elsewhere for "full"/negative states).
- **`routes/staff/StaffSchedule.tsx`** — each eligible row gets a "Cancel booking" button; clicking it opens `CancelBookingDialog`. On success, the schedule re-fetches (a `refreshKey` state bumped and included in the existing `usePromise` deps array — the same pattern the earlier packages-fetch-retry fix already established) rather than optimistically guessing the new state locally — the row then shows the real server-confirmed "Cancelled" badge. Cancelled bookings are never removed from the schedule (the query was never filtered by status) — they stay visible with the badge, satisfying "keep cancelled history visible."
- **`data/firebase/staffApi.ts`** — `ScheduleBooking` gained `source`/`cancellationReason`; new `CancelManualBookingInput`/`Result` types, a `CancelManualBookingError` class with the same discriminated-reason pattern `ManualBookingError` already established (`not-found` / `ineligible` / `invalid-request` / `unknown`), and a `cancelManualBooking()` wrapper calling the new callable.
- **`i18n/translations.ts`** — `staff.statusCancelled` and a new `staff.cancelBooking.*` block (button, dialog title/body, reason label/placeholder/required, keep/confirm buttons, cancelling/success text, and one error message per discriminated reason), both English and Sinhala. The i18n parity test (both dictionaries typed against the same shape, checked at compile time and at runtime) passes.

#### Verification actually run

**Node 22, process-scoped** (`/opt/homebrew/opt/node@22/bin` prefixed on `PATH` for these commands only — global `node` untouched, no other manual environment setup beyond that PATH prefix):

| # | Suite | Command | Result |
|---|---|---|---|
| 1 | Typecheck | `npm run typecheck` | ✅ pass (booking-core, app, functions) |
| 2 | Lint | `npm run lint` | ✅ pass, 0 errors/warnings |
| 3 | Unit tests | `npm run test:unit` | ✅ **71/71** (21 booking-core + 50 app — unchanged from before this phase; all new coverage this phase is integration-level, below) |
| 4 | Production build (frontend) | `npm run build` | ✅ succeeds |
| 5 | Production build (functions) | `npm run build:functions` | ✅ succeeds |
| 6 | **Backend, isolated emulator** | manual isolated-instance run (own project/ports, see docs below) | ✅ **93/93** (75 before this phase + 18 new in `cancelManualBooking.emulator.test.ts`) |
| 7 | **Browser, isolated emulator, `@emulator`** | `npm run test:e2e:emulator` (self-contained, isolated) | ✅ **19/19** (14 before this phase + 5 new in `cancelManualBooking.emulator.spec.ts`) |

**Every explicitly required test scenario, and where it's proven:**

| Requirement | Result |
|---|---|
| Staff success | ✅ `cancelManualBooking.emulator.test.ts` — staff cancels a confirmed manual booking; `bookingStatus` becomes `"cancelled"`, `paymentStatus` stays `"unpaid"`, original fields preserved |
| Owner success | ✅ same file — owner cancels a confirmed manual booking |
| Unauthorized rejection | ✅ unauthenticated guest → `unauthenticated`; signed-in no-role account → `permission-denied`; `role: "owner"` tampering in the payload has no effect |
| Reject a started booking | ✅ a synthetic already-started booking (direct Firestore write, bypassing `createManualBooking`, which itself refuses to create one) is rejected with `failed-precondition` for **both** staff and owner — no owner override, proven not just asserted |
| Reject a paid booking | ✅ a confirmed manual booking with `paymentStatus` patched directly to `"succeeded"` (no real way to reach that state through the API yet — D14) is rejected |
| Reject an online booking | ✅ a real `createHold` guest hold's booking id, passed to `cancelManualBooking` → `failed-precondition`, booking untouched (`bookingStatus` still `"pending_hold"`) |
| Reject a Party booking | ✅ a synthetic `packageId: "party"`/`bookingStatus: "confirmed"` booking (direct Firestore write — the create API already refuses Party) is rejected by the defense-in-depth `isBookableOnline` check |
| Reject empty reasons | ✅ empty string, whitespace-only, and overlong (501 chars) reasons all rejected with `invalid-argument`, booking left `"confirmed"` |
| Repeated cancellation is safe | ✅ two sequential calls with *different* reason text: second call returns the *first* call's exact result, only 1 audit entry exists, the interval array has exactly 1 entry for that booking id (not duplicated/re-released) — **and** a true concurrent double-click (`Promise.allSettled`, two simultaneous calls) still produces exactly 1 audit entry, both calls resolve successfully (not "first wins, second errors") |
| Released inventory can be re-booked without double-booking | ✅ cancel booking A → create booking B for the identical room/date/time → succeeds, different booking id, same room; a third concurrent-style attempt for that now-reoccupied slot is rejected — proven at both the backend level (interval array shows A `"cancelled"`/B `"confirmed"`) and the full browser level (two real UI-driven bookings back to back) |
| No effect on another booking | ✅ two manual bookings on the same room/date, different times — cancelling one leaves the other's booking doc and inventory interval completely unchanged (still `"confirmed"`, still no expiry) |
| Browser cancellation flow | ✅ `cancelManualBooking.emulator.spec.ts` — full dialog flow: booking details shown, empty-reason rejected inline (dialog stays open), successful cancel closes the dialog, refreshes the schedule, shows the "Cancelled" badge, "Unpaid" badge still present (payment untouched), Cancel action no longer offered |
| Keyboard navigation | ✅ Escape closes the dialog without cancelling anything (booking stays `"confirmed"`, Cancel action still offered) — proven against the native `<dialog>`'s real `cancel` event, not simulated |
| Mobile (390px) | ✅ full cancel flow at 390px viewport |
| Sinhala | ✅ full cancel flow (dialog title, booking summary, reason field, confirm button, "Cancelled" badge) in Sinhala |

**A real bug found and fixed while writing the browser tests**: the first draft of the "staff cancels..." test asserted on booking-detail text (e.g. "Cancel Flow Customer · 0771230001") without scoping to the dialog — Playwright correctly failed with a strict-mode violation because the *same* text is genuinely visible twice at once (once in the schedule row behind the dialog, once inside the dialog's own summary — the schedule page is still fully rendered underneath a native `<dialog>`, which is exactly right, not a bug in the app). Fixed by scoping the assertion to `page.getByRole("dialog")`.

#### Owner manual verification (2026-09-21, your live preview)

Confirmed directly by you against your own running preview (not the isolated test emulator): cancelling a booking leaves it visible on the schedule as **Cancelled** (not removed — history preserved, matching the automated result above), and the released **AC Small** slot can be booked again (matching the "released inventory can be re-booked without double-booking" result above). No new code changes were made after this — the automated results above (93/93 backend, 19/19 browser, 71/71 unit, typecheck/lint/build clean) stand unchanged and were not re-run for this checkpoint, since nothing they cover changed.

#### Isolated emulator instructions used

Same isolated instance (`firebase.test.json`, project `demo-apex-cinema-test`, ports 9199/8180/5101) and the same reliable `emulators:start`-in-background workflow documented in the Phase 5 section above. The backend suite was run manually (start → poll for "All emulators ready" → seed → `npm run test --workspace functions` → stop); the browser suite used the now-self-contained `npm run test:e2e:emulator` (see the test-isolation checkpoint above) with zero manual environment setup beyond the Node 22 `PATH` prefix. Confirmed before and after every run: isolated ports freed; the live preview emulator (default ports, `./emulator-data`) healthy and completely unchanged (same file timestamps, `holds`/`bookings` untouched).

#### Files changed

`functions/src/cancelManualBooking.ts` (new), `functions/src/index.ts` (export), `functions/src/lib/inventory.ts` (`IntervalStatus` +`"cancelled"`, new `cancelManualBookingTransactional`), `functions/src/lib/validation.ts` (new `validateCancelManualBookingRequest`), `functions/src/lib/schedule.ts` (`DisplayStatus` +`"cancelled"`, `ScheduleBooking`/`RawBooking` +`source`/`cancellationReason`), `functions/tests/cancelManualBooking.emulator.test.ts` (new, 18 tests); `app/src/components/staff/CancelBookingDialog.tsx` (new), `app/src/components/ui/{dialog,textarea}.tsx` (new), `app/src/components/staff/scheduleFormat.ts` (`isCancelEligible`, `STATUS_BADGE_VARIANT` +`cancelled`), `app/src/routes/staff/StaffSchedule.tsx` (cancel button, dialog wiring, refresh-on-success), `app/src/data/firebase/staffApi.ts` (`ScheduleBooking` fields, `CancelManualBooking*` types/error/wrapper), `app/src/i18n/translations.ts` (`staff.statusCancelled` + `staff.cancelBooking.*`, both languages); `app/e2e/cancelManualBooking.emulator.spec.ts` (new, 5 tests); `docs/DECISIONS.md` (D15, open item #6 update); `docs/PROGRESS.md` (this section).

#### Known limitations / honest gaps

- No Owner override for an already-started or past booking — deliberately not built this phase (see D15, open item #6). A future phase needs an explicit owner decision on the exact cutoff/condition before that's implemented.
- No extension approval, no Party (room 6) manual entry, no payment recording/confirmation — all still out of scope, unchanged from Phase 5.
- The owner overview's `ScheduleCounts` (`getOwnerOverview`) was not extended with a `cancelled` count — cancelled bookings still count toward `total` but not toward any specific sub-category. Not requested this phase; a small, low-risk follow-up if the owner overview should surface cancellation counts.
- `cancellationReason` is stored and returned by the API and visible via direct Firestore inspection, but the staff schedule UI doesn't currently render it inline on the row (only the "Cancelled" badge) — the booking's history is fully preserved and retrievable, just not surfaced as extra UI text this phase; a small follow-up if staff want to see the reason at a glance without opening the (now cancelled) booking's original dialog context.

### Phase 7 — Manual-booking one-hour extensions (local emulators only)

**Status: implemented and verified 2026-09-21, awaiting your local review. Not committed, not pushed, not merged.** Implements the extension half of Phase 5/6's proposed "staff/owner mutations, part 3," scoped down exactly as this phase's approved brief specified: staff-approved +1 hour / LKR 1,000 extensions of confirmed, unpaid manual bookings for standard rooms 1–5 only, before or during the session, up to closing time. Party manual entry (the rest of "part 3") remains future work.

Branch: `feature/manual-booking-extensions`, cut from verified `main` (post-PR-#2 merge commit `6fe8ede`) — Phases 5 and 6's work is untouched, this branch adds only extension.

#### Approved scope and rules (given verbatim, not engineering defaults)

- Staff and Owner only.
- Confirmed, unpaid manual bookings for standard rooms 1–5 only.
- Allow extension before or during the session, but not once its current end time has been reached, using server time.
- Each explicit approval adds exactly 60 minutes and LKR 1,000.
- Further one-hour extensions require a fresh explicit approval.
- The extended session must end at or before 21:00 Asia/Colombo.
- Keep the same room, date, start time and guest capacity.
- Reject overlaps with confirmed bookings and unexpired holds.
- No Party, online holds, paid bookings, payment collection or refunds.

The LKR 1,000 fee and the "ends by 21:00" rule are **not new business policy invented this phase** — both have been public, confirmed facts in `docs/PROJECT_BRIEF.md` ("Duration & extensions") and shown as marketing copy (`i18n/translations.ts`'s `extensionNote`/FAQ entries) since an earlier phase. This phase finally *implements* an already-promised rule. See `docs/DECISIONS.md` D16 for the full recorded decision.

#### Backend (`functions/src`)

- **`extendManualBooking`** (new callable) — Staff or Owner only (`requireRole`, checked before touching the request body). Delegates to a new `extendManualBookingTransactional` in `lib/inventory.ts`, reusing the exact per-room/per-date inventory-doc + transaction pattern every prior mutation here uses.
- **Eligibility, all re-checked server-side inside the transaction**: booking exists; `bookingStatus === "confirmed"`; `source` is `"staff_walkin"`/`"staff_phone"` (excludes online + any future Party source); `paymentStatus === "unpaid"`; package `isBookableOnline` (excludes Party); and — the opposite time window from cancellation — the booking's *current* end time hasn't passed yet (allowed before **or during** the session, rejected only once it's actually ended). The new end time must satisfy `endsWithinBusinessHours` (`<= 21:00`, the same helper every other session-length check in this codebase already uses — not a new number). Exactly `EXTENSION_MINUTES`/`EXTENSION_FEE_LKR` (60/1000, new shared constants in `packages/booking-core`, same treatment as `OPEN_MINUTE`/`CLOSE_MINUTE`/`SESSION_MINUTES`) — never a client-supplied amount or duration.
- **Same room, no reassignment.** The extra hour is checked for conflicts only on the booking's *own* room (no `findFreeRoom` search across a tier) — every other *active* interval on that room/date (confirmed, or an unexpired hold) is checked for overlap against the new, longer `[startMinute, newEndMinute)` range; an expired hold is correctly ignored (`isActive`, unchanged). `startMinute`, `roomId`, `peopleCount` are never touched.
- **Price preserved, charges tracked separately, total computed.** `totalAmountMinor` (the original package price) is never written by this function. Each approval increments `extensionCount`/`extensionChargesMinor` on the booking doc and writes one doc to the now-implemented `bookings/{id}/extensions/{extensionId}` subcollection (`approvedByUid`, `previousEndMinute`/`newEndMinute`, `feeMinor`, `createdAt` — docs/ARCHITECTURE.md §3). The response's `newTotalAmountMinor` is `totalAmountMinor + extensionChargesMinor`, always computed on the fly — never a third stored grand-total field that could drift from the two it's derived from.
- **Idempotency + optimistic concurrency, together — the part of this phase that needed real design, not just a copy of the cancellation pattern.** Cancellation could use "is it already cancelled" as its own idempotency check because it has exactly one reachable end state. Extension doesn't: a second approval is structurally identical to a first one, so state alone can't tell "a safe retry of the approval that just happened" apart from "a new approval, sent against a state the caller never actually saw." The request therefore carries both a normal idempotency key (`extensionIdempotency/{key}`, fingerprinted with the actor + booking id + `expectedCurrentEndMinute`) *and* that `expectedCurrentEndMinute` is separately checked against the booking's real current end time inside the transaction:
  - Same key, same expected end time (a genuine retry) → idempotent no-op, returns the original result unchanged, no second hour, no second charge.
  - Same key, a *different* expected end time → `already-exists` (key reuse for a different request).
  - A *new* key whose expected end time doesn't match the booking's actual current end time → `aborted` — this is the case that actually matters: staff clicking Extend twice before the UI has refreshed generates a fresh key each time (it looks like a deliberate new action), but the stale expected end time is caught and rejected *before any write*, so it can never silently stack a second hour on top of a first extension the caller hadn't seen yet.
  - An intentional further extension — using the *updated* end time (from the previous response) and a *new* key — succeeds normally, exactly per this phase's brief ("further one-hour extensions require a fresh explicit approval... using the updated booking state and a new operation ID").
- **`lib/validation.ts`**'s new `validateExtendManualBookingRequest` checks only shape/presence (bookingId, expectedCurrentEndMinute, idempotencyKey) — every actual eligibility and staleness check happens server-side inside the transaction, which needs to read the booking doc anyway.
- **`lib/schedule.ts`**'s `ScheduleBooking`/`getBookingsForDate` gained `totalAmountMinor`/`extensionCount`/`extensionChargesMinor` (read-only, for the staff UI's extend-dialog preview and "extended +Nh" indicator) — `endMinute` itself already reflected extensions automatically, with zero changes needed, since it's read straight from the same `bookings` doc the extension transaction writes to.
- **Public availability reflects extensions with zero code changes.** `computeAvailability` (`lib/availability.ts`) was never touched — it already reads the same `inventory/{roomId}_{dateISO}` docs and does the same `isActive`/`minutesOverlap` check against each candidate public slot, so once an interval's `endMinute` grows, every slot that now overlaps it is correctly marked unavailable automatically. Verified directly: extending a 09:00 AC Small booking to 09:00–13:00 makes the 12:00 public slot show `"full"` — the exact canonical example from `docs/PROJECT_BRIEF.md`.
- **Cancellation releases the full extended interval, unmodified.** `cancelManualBookingTransactional` (Phase 6) needed **no changes at all** for this to work correctly: it already reads the booking's *current* `endMinute` fresh and finds the matching interval by `bookingId` (not by original start/end values), so an extended-then-cancelled booking's interval is released at its actual extended end time — verified directly, not just reasoned through (see below).
- **`firestore.rules`** — two new explicit deny blocks (`extensionIdempotency/{key}`, `bookings/{bookingId}/extensions/{extensionId}`), matching the established per-collection pattern; both were already covered by the root catch-all, explicit for the same clarity/defense-in-depth reasoning as every other collection here. No new *allow* rule anywhere — every read/write still goes through a Cloud Function.

#### Frontend (`app/src`)

- **`components/staff/ExtendBookingDialog.tsx`** (new) — a confirmation dialog showing the current end time, the new end time, the LKR 1,000 additional charge, and the new total (computed from `totalAmountMinor` + prior `extensionChargesMinor` + this extension's fee), plus an explicit "payment is not recorded" notice. No reason field (not required by this phase's rules, unlike cancellation). Captures `booking.endMinute` as `expectedCurrentEndMinute` when the dialog is confirmed, and generates a fresh `crypto.randomUUID()` idempotency key per confirm click — never reused across separate dialog opens, satisfying "an intentional further extension must use the updated booking state and a new operation ID."
- **`components/ui/dialog.tsx`** — reused unchanged from Phase 6 (no new dialog primitive needed).
- **`components/staff/scheduleFormat.ts`**'s new `isExtendEligible(booking, scheduleDateISO)` mirrors `extendManualBookingTransactional`'s eligibility exactly (cosmetic only, docs/SECURITY.md §3) — the OPPOSITE time window from `isCancelEligible` (allowed before/during, not after the *current* end time), plus a closing-time pre-check so the button isn't shown for a booking that would immediately bounce off `endsWithinBusinessHours` anyway.
- **`routes/staff/StaffSchedule.tsx`** — each eligible row gets an "Extend +1 hour" button alongside the existing Cancel button (both can appear on the same row simultaneously — extending and cancelling are independent, non-conflicting eligibility windows); a booking with `extensionCount > 0` shows an "extended +Nh" indicator next to its time range. On success, the same `refreshKey`-bump pattern Phase 6 established re-fetches the schedule so the new end time, charge summary, and public availability all reflect the real server state. On a **stale-state conflict specifically**, the schedule is refreshed immediately too (`onStaleConflict`) — but the dialog itself stays open, still showing the explanatory error message, rather than closing silently out from under the staff member reading it.
- **`data/firebase/staffApi.ts`** — `ScheduleBooking` gained `totalAmountMinor`/`extensionCount`/`extensionChargesMinor`; new `ExtendManualBookingInput`/`Result` types, an `ExtendManualBookingError` class with a `stale-state` reason distinct from the existing `idempotency-conflict` (so the dialog can show a specifically-worded "this booking changed, please recheck" message), and an `extendManualBooking()` wrapper.
- **`i18n/translations.ts`** — a new `staff.extendBooking.*` block (button, dialog title/body, current/new end labels, charge/total labels, unpaid notice, confirm/cancel/extending text, the "extended +{{count}}h" indicator, and one error message per discriminated reason, including the stale-state one), both English and Sinhala. The i18n parity test passes.

#### Verification actually run

**Node 22, process-scoped** (`/opt/homebrew/opt/node@22/bin` prefixed on `PATH` for these commands only — global `node` untouched, no other manual environment setup beyond that for the browser suite, which is fully self-contained):

| # | Suite | Command | Result |
|---|---|---|---|
| 1 | Typecheck | `npm run typecheck` | ✅ pass (booking-core, app, functions) |
| 2 | Lint | `npm run lint` | ✅ pass, 0 errors/warnings |
| 3 | Unit tests | `npm run test:unit` | ✅ **71/71** (21 booking-core + 50 app — unchanged; all new coverage this phase is integration-level, below) |
| 4 | Production build (frontend) | `npm run build` | ✅ succeeds |
| 5 | Production build (functions) | `npm run build:functions` | ✅ succeeds |
| 6 | **Backend, isolated emulator** | manual isolated-instance run (own project/ports) | ✅ **121/121** (93 before this phase + 28 new in `extendManualBooking.emulator.test.ts`, including the 2 new `firestore.rules.test.ts` assertions) |
| 7 | **Browser, isolated emulator, `@emulator`** | `npm run test:e2e:emulator` (self-contained, isolated) | ✅ **24/24** (19 before this phase + 5 new in `extendManualBooking.emulator.spec.ts`) |

**Every explicitly required test scenario, and where it's proven:**

| Requirement | Result |
|---|---|
| Staff/Owner success and unauthorized rejection | ✅ staff and owner both succeed; unauthenticated → `unauthenticated`; no-role → `permission-denied`; `role: "owner"` payload-tampering has no effect |
| Server-calculated amounts; reject client price manipulation | ✅ a request with `extensionFeeMinor`/`newTotalAmountMinor` fields set to `1` is ignored entirely — the response always shows the real LKR 1,000 fee and the real computed total |
| Conflicts with reservations and active holds; expired holds ignored | ✅ a confirmed booking on the same room in the extra hour → rejected; an unexpired online hold on the same room in the extra hour → rejected; the identical hold *backdated* to expired → the extension succeeds |
| Ending exactly at 21:00 allowed; later rejected | ✅ three sequential extensions from a 15:00 start (18:00→19:00→20:00→21:00) all succeed, ending exactly at closing; a fourth attempt is rejected, and the booking's stored `endMinute` is confirmed unchanged by the rejected attempt |
| Ended, cancelled, paid, online-hold and Party bookings rejected | ✅ each proven independently: an already-ended booking (synthetic, since the create API refuses a past time); an already-cancelled booking (real cancel-then-extend); a `paymentStatus` patched away from `"unpaid"` (synthetic, since D14 has no real "paid" path yet); a real online hold's booking id; a synthetic `packageId: "party"`/`confirmed` booking (synthetic, since the create API refuses Party) — every case verified `failed-precondition` and, where applicable, that the booking was left completely unchanged. Also proven the *opposite*: an in-progress (started, not yet ended) synthetic booking **is** eligible — extension succeeds during the session, not just before it, distinguishing this from cancellation's window |
| Retries and simultaneous extensions cannot double-apply | ✅ exact retry (same key, same expected end time) → identical result, endMinute advances by only 60 total, exactly 1 extension doc, exactly 1 audit entry; true concurrent double-click (`Promise.allSettled`, same key) → both calls resolve, still only 1 extension applied; reusing a key with a *different* expected end time → `already-exists`; a **new** key against a **stale** expected end time → `aborted`, endMinute still only +60, not +120 — the exact bug this design exists to prevent, proven not just reasoned through; an intentional further extension (new key, updated expected end time) → succeeds, endMinute now +120, extensionCount 2 |
| Extension racing with another booking cannot double-book | ✅ `Promise.allSettled` — extending a booking's session into the next public slot's time range, concurrently with a real guest hold request for that same room's public slot: exactly one of the two succeeds, and `getAvailability` afterward shows that slot as `"full"` either way (never both winning, never neither) |
| A 09:00–13:00 reservation blocks the 12:00–15:00 public slot | ✅ proven at both the backend level (direct `getAvailability` call after extending) and the full browser level (staff extends via the real UI, then a real customer-facing `/book` wizard visit shows the 12:00 slot disabled) — matches `docs/PROJECT_BRIEF.md`'s canonical example exactly |
| Cancellation releases the entire extended interval | ✅ extend a booking, then cancel it — the released inventory interval shows the **extended** end time (not the original), and a brand-new manual booking can be made for the portion of the day that was only freed by the extension (e.g. the 12:00 slot after a 09:00–13:00 extended-then-cancelled booking) |
| Browser confirmation flow, mobile and Sinhala | ✅ `extendManualBooking.emulator.spec.ts` — full dialog flow (current/new end time, LKR 1,000 charge, new total, unpaid notice, confirm → schedule updates with the "extended +1h" indicator); Escape closes without extending (keyboard navigation, proven against the native `<dialog>`'s real `cancel` event); 390px mobile; Sinhala (dialog + confirm + extended range, in Sinhala) |

**A real bug found and fixed while writing the browser tests** (the same class of mistake as Phase 6's, caught the same way): the first draft of the "extended slot blocks the public slot" test asserted `page.getByText("09:00–13:00")` right after clicking Confirm, without first waiting for the confirmation dialog to actually close. Because the dialog itself *previews* the would-be new end time ("09:00–13:00") before the request even completes, that assertion could pass while the real request was still in flight — so the subsequent navigation to the public booking wizard sometimes ran before the extension had actually committed, and the 12:00 slot correctly (from the server's honest point of view) still showed available. Fixed by asserting the dialog's heading is gone *before* checking the schedule row's new text, in all three tests that share this pattern (desktop, mobile, Sinhala) — not an app bug, a test-timing bug, caught by the test failing exactly the way a real timing bug would have.

#### Isolated emulator instructions used

Same isolated instance (`firebase.test.json`, project `demo-apex-cinema-test`, ports 9199/8180/5101) and the same reliable `emulators:start`-in-background workflow documented in the Phase 5/6 sections above. The backend suite was run manually (start → poll for "All emulators ready" → seed → `npm run test --workspace functions` → stop); the browser suite used the self-contained `npm run test:e2e:emulator` with zero manual environment setup beyond the Node 22 `PATH` prefix. Confirmed before and after every run: isolated ports freed; the live preview emulator (default ports, `./emulator-data`) healthy and completely unchanged.

#### Files changed

`packages/booking-core/src/businessRules.ts` (+`EXTENSION_FEE_LKR`/`EXTENSION_MINUTES`) + `index.ts` (re-export); `functions/src/extendManualBooking.ts` (new), `functions/src/index.ts` (export), `functions/src/lib/inventory.ts` (new `extendManualBookingTransactional`), `functions/src/lib/reference.ts` (new `fingerprintExtensionRequest`), `functions/src/lib/validation.ts` (new `validateExtendManualBookingRequest`), `functions/src/lib/firestore.ts` (`extensionIdempotency`/`bookingExtensions` collection names), `functions/src/lib/schedule.ts` (`ScheduleBooking`/`RawBooking` +`totalAmountMinor`/`extensionCount`/`extensionChargesMinor`), `functions/tests/extendManualBooking.emulator.test.ts` (new, 28 tests), `functions/tests/firestore.rules.test.ts` (+2 assertions); `firestore.rules` (+2 explicit deny blocks); `app/src/components/staff/ExtendBookingDialog.tsx` (new), `app/src/components/staff/scheduleFormat.ts` (`isExtendEligible`), `app/src/routes/staff/StaffSchedule.tsx` (extend button, dialog wiring, extended-badge, refresh-on-success/stale-conflict), `app/src/data/firebase/staffApi.ts` (`ScheduleBooking` fields, `ExtendManualBooking*` types/error/wrapper), `app/src/i18n/translations.ts` (`staff.extendBooking.*`, both languages); `app/e2e/extendManualBooking.emulator.spec.ts` (new, 5 tests); `docs/DECISIONS.md` (D16), `docs/ARCHITECTURE.md` (§1 status line, §3 data model, §4 state diagram, §6 idempotency — also corrected two places that were still stale from Phase 6's cancellation work and never updated then), `docs/PROGRESS.md` (this section).

#### Known limitations / honest gaps

- No maximum extension count is enforced beyond the natural closing-time limit (`endsWithinBusinessHours`) — per this phase's rules, that's correct (only "ends by 21:00" was specified), not an oversight, but flagging it as a deliberate absence rather than silence.
- Party (room 6) manual entry — the other half of the originally-proposed "staff/owner mutations, part 3" — remains entirely out of scope, unchanged.
- The owner overview's `ScheduleCounts` was not extended with any extension-related figures (e.g. total extension revenue for a date) — not requested this phase.
- `docs/ARCHITECTURE.md`'s booking-status diagram now correctly shows `confirmed`→`cancelled` as implemented, but this was a pre-existing staleness gap from Phase 6 (the diagram was never updated when cancellation shipped) — corrected as part of this phase's docs pass rather than left for a future one, since leaving it would have made the diagram internally contradict this phase's own D16 addition sitting right next to it.

### Dev-server blank-screen fix #2 — Extend dialog (before starting Phase 8)

**Status: done, verified 2026-09-21.** User-reported, on the running Vite **dev** preview (`http://localhost:5173/staff`, not the production build): a confirmed, unpaid AC Small manual booking's "Extend +1 hour" button turned the entire page black/empty — URL stayed `/staff`, no dialog appeared. Local dev only; no `feature/manual-booking-extensions` application code was changed. Reproduced first, against the real dev server, before any change.

#### First console exception captured (before any fix)

```
TypeError: Cannot read properties of undefined (reading 'toLocaleString')
    at ExtendBookingDialog (.../ExtendBookingDialog.tsx?t=...:210:71)
```
— plus React's "Consider adding an error boundary" warning, which is *why* the whole page went blank rather than just the dialog: this app has no error boundary anywhere in its render tree, so one component's uncaught render exception unmounts the entire tree.

#### Root cause — two layers, neither of them the previous SLOT_TIMES issue

This is explicitly **not** a repeat of the earlier "[Dev-server blank-screen fix](#dev-server-blank-screen-fix-before-starting-phase-5)" (line ~514): that bug was esbuild never pre-bundling `@apex-cinema/booking-core` at all, so the raw CJS module had no named exports visible to the browser's ES-module loader (`optimizeDeps.include` fix, still present and correct in `app/vite.config.ts` — verified unchanged). This bug is different: the package **was** included and pre-bundled, but the dev server's on-disk pre-bundle cache was **stale relative to newly-added exports**:

1. **Stale `optimizeDeps` cache (the actual defect).** Phase 7 added `EXTENSION_FEE_LKR`/`EXTENSION_MINUTES` to `packages/booking-core/src/businessRules.ts` at 09:50 on 2026-09-21. The developer's `vite dev` process (`npm run dev`) had been running continuously since *before* that change — since 20:04 the previous evening — and Vite's dev-server dependency optimizer only re-scans and re-bundles a linked package when the server itself starts (or is told to force a re-scan); it does not detect a dependency's source changing while it stays alive. So `app/node_modules/.vite/deps/@apex-cinema_booking-core.js`, generated at 20:04, simply had no `EXTENSION_FEE_LKR` export. `ExtendBookingDialog.tsx`'s import of `EXTENSION_FEE_LKR` (an **imported constant**, not booking data) resolved to `undefined`, and its `.toLocaleString()` call at line 135 (and the arithmetic using it at lines 69–71) threw. Confirmed directly, not assumed: (a) direct browser-side inspection of the served dependency chunk showed the export missing; (b) `packages/booking-core/src/businessRules.ts` and its *built* `dist/businessRules.js`/`dist/index.js` both correctly contained the export (`grep` + `stat` — source mtime Sep 21 09:50, dist mtime Sep 21 10:57) — proving the bug was never in application source or the package build, only in the dev server's stale cache; (c) deleting `app/node_modules/.vite` while the server stayed running did **not** regenerate it on reload — confirming the live process, not the on-disk artifact, was the thing that needed to change state.
2. **Stale browser HTTP cache (the reason a first cache fix alone didn't visibly resolve it).** After killing and restarting the dev-server process (regenerating a verified-correct on-disk cache, confirmed via `grep -n "EXTENSION"` showing real `Object.defineProperty` exports), the already-open browser tab still crashed identically on a normal reload — its own HTTP cache had the old, stale dependency-chunk response cached by URL and didn't re-request it. A hard reload (bypassing the HTTP cache) picked up the corrected chunk and the dialog rendered correctly.

**Data compatibility was explicitly checked and ruled out as a contributing cause**, per this task's instruction not to assume and not to paper over real gaps with invented defaults: `functions/src/lib/schedule.ts` already maps `extensionChargesMinor: raw.extensionChargesMinor ?? 0` and `totalAmountMinor: raw.totalAmountMinor ?? null` for older persisted bookings that predate Phase 7, and `ExtendBookingDialog.tsx` already handles `booking.totalAmountMinor` defensively (`?? 0`). `booking.extensionChargesMinor` is typed as a plain `number` specifically because the server already guarantees it's never absent. None of this needed to change — the crash was entirely on `EXTENSION_FEE_LKR`, a module-level imported constant, never on booking data.

#### Fix applied

**Operational only — zero application source files changed.** `ExtendBookingDialog.tsx`, `Dialog.tsx`, `scheduleFormat.ts`, `StaffSchedule.tsx`, `vite.config.ts` are all byte-identical to before this task. The fix was:

1. Stopped the stale dev-server process (`kill` the `npm run dev` PID) and restarted it with the exact documented command, `VITE_DATA_MODE=emulator npm run dev --workspace app`, which forces a fresh `optimizeDeps` scan/bundle against current source.
2. Hard-reloaded the already-open preview tab to discard its stale HTTP-cached copy of the old dependency chunk.

No booking data was reset, no defaults were invented, and — per explicit instruction — the user's existing live-preview bookings were never confirmed, cancelled, or extended in the course of reproducing or fixing this; the crash occurs on dialog *open*, before any mutation, and the booking visible throughout was left exactly as found (`12:00–15:00 · AC Small · Unpaid`, confirmed unchanged before and after via `emulator-data/` timestamps).

#### Why every existing browser test missed this

Every Playwright spec in this repo before this task (`playwright.config.ts`, both the fixture-mode and `@emulator` suites) runs against `app/dist` served by `vite preview` — a full, static Rollup bundle built fresh from current source on every run, with no persistent cross-run cache to go stale. Production builds structurally cannot exercise `vite dev`'s `optimizeDeps` pre-bundling pipeline at all, so no amount of running the existing suite — before or after this fix — could ever have caught a dev-server-cache-staleness bug. This is a real, previously-total coverage gap, not a flaky or under-tested corner of an existing suite.

#### New regression coverage added

- **`app/playwright.dev.config.ts`** (new) — a second Playwright config whose `webServer` starts a genuinely fresh `vite dev` server (`reuseExistingServer: false`), not `vite preview`. Deliberately bound to an isolated port (`5183`, with `--strict-port`) and `127.0.0.1` explicitly — never port 5173 (the developer's own live preview), so this suite can never collide with, or accidentally act on, real preview data. Points at the isolated Firebase emulator (`demo-apex-cinema-test`, ports 9199/8180/5101), same as the existing `@emulator` suite.
- **`app/e2e/extendManualBooking.devmode.spec.ts`** (new, tagged `@devmode @emulator`) — signs in as staff, creates a real AC Small manual booking via the UI, clicks "Extend +1 hour", and asserts: the dialog heading actually renders (the real regression — a blank page fails this), the exact preview values (`12:00–15:00` → `12:00–16:00`, `LKR 1,000`, `LKR 4,200`, "Payment not recorded"), and **zero console/page errors at any point** — the assertion that actually distinguishes "fixed" from "still broken" here, not just that some text happens to be on screen. Then confirms the extension (safe: synthetic data, isolated emulator) and re-asserts zero page errors.
- **`scripts/test-e2e-devmode-isolated.sh`** (new) + root **`package.json`**'s `test:e2e:devmode` script — mirrors the existing isolated-emulator workflow (`emulators:start`-in-background + readiness poll, never `emulators:exec`), ending in `playwright test --config playwright.dev.config.ts --grep @devmode` instead of a production build.
- **`app/tsconfig.node.json`** — added `playwright.dev.config.ts` to `include` (it was missing this, which is why a comment-syntax bug in the new config wasn't caught by `tsc` the first time — see below; closing a real typecheck-coverage gap, not just working around one bug instance).
- **Known, stated limitation**: this suite always starts a genuinely fresh dev server, so by construction it can never reproduce the *exact* staleness timing of the real incident (a long-running server with source changing underneath it) — a brand-new server always optimizes against current source. Its value is coverage that didn't exist at all before: proving the real dev-mode transform/module-resolution pipeline renders this dialog without throwing, which would also catch a broader class of dev-mode-only regressions (e.g. `optimizeDeps.include` being accidentally removed, or another dependency losing CJS→ESM interop).

#### Bugs hit while building the new test lane (not the main bug, but worth recording)

- A literal `*/` inside `TEST_*/VITE_FIREBASE_*` in a `/** ... */` JSDoc comment in the first draft of `playwright.dev.config.ts` prematurely closed the comment block, causing a syntax error when Playwright loaded the config. Fixed with a space (`TEST_* / VITE_FIREBASE_*`); also fixed the `tsconfig.node.json` gap above so `tsc` would catch this class of error in the future.
- First draft used port 5173 for the new suite's dev server — the same port as the developer's live preview. Recognized as a real safety risk before ever running it (could collide with, or worse, let the test's Confirm-click land on a real preview booking) and changed to isolated port 5183 with `--strict-port`.
- First run of `npm run test:e2e:devmode` timed out waiting for the webServer (`Timed out waiting 30000ms`) even though Vite's own log said "ready" — diagnosed by running the exact webServer command manually and `curl`-ing it directly (connection refused). Root cause: missing `--host 127.0.0.1`, so Vite wasn't bound to an address reachable at that exact address in this environment. Fixed by adding `--host 127.0.0.1`, matching the existing `playwright.config.ts`'s pattern for `vite preview`.

#### Verified

Live preview (manual, direct browser check, real dev server + real Firestore emulator data — no mutation of the user's existing booking at any point):

- Clicking Extend now opens the dialog with zero console errors.
- The `12:00–15:00` AC Small booking previews `12:00–16:00`, `LKR 1,000` additional charge, `LKR 4,200` new total, and an explicit unpaid notice — exact match to the required values.
- Escape closes the dialog with no change to the booking (confirmed via before/after schedule text).
- The user's real booking was left exactly as found throughout (`Unpaid`, unchanged) — confirmed again after all verification work, including that `emulator-data/` timestamps never changed.

Automated, Node 22 process-scoped (`/opt/homebrew/opt/node@22/bin` prefixed to individual commands only):

| # | Suite | Command | Result |
|---|---|---|---|
| 1 | Typecheck | `npm run typecheck` | ✅ pass (now also covers `playwright.dev.config.ts`) |
| 2 | Lint | `npm run lint` | ✅ pass, 0 errors/warnings |
| 3 | Unit tests | `npm run test:unit` | ✅ 71/71, unchanged |
| 4 | Production build (frontend) | `npm run build` | ✅ succeeds |
| 5 | Production build (functions) | `npm run build:functions` | ✅ succeeds |
| 6 | Backend, isolated emulator | manual isolated-instance run | ✅ 121/121, unchanged |
| 7 | Browser, isolated emulator, `@emulator` (production build) | `npm run test:e2e:emulator` | ✅ **25/25** (24 previous + the new devmode spec, which is also tagged `@emulator` so it runs here too, and passes under `vite preview` as well) |
| 8 | **Browser, isolated emulator, `@devmode` (real `vite dev`)** | `npm run test:e2e:devmode` | ✅ **1/1** — the actual regression test for this bug |

English/Sinhala/mobile rendering of the extend dialog: not re-verified manually this pass (a supplementary manual check ran into unrelated browser-automation tooling friction after a viewport resize and was abandoned as redundant) — already conclusively covered by the existing, passing `extendManualBooking.emulator.spec.ts` "390px mobile" and "Sinhala" cases (both in the 25/25 above), which exercise the identical dialog code path this bug was in.

Confirmed throughout and after: isolated emulator ports (9199/8180/5101/5183) fully freed after each run; the user's live preview (port 5173, default emulator ports 9099/8080/5001, `./emulator-data`) healthy and untouched — `emulator-data/` timestamps unchanged from before this task.

#### Files changed

`app/playwright.dev.config.ts` (new), `app/e2e/extendManualBooking.devmode.spec.ts` (new), `scripts/test-e2e-devmode-isolated.sh` (new), `package.json` (root, +`test:e2e:devmode` script), `app/tsconfig.node.json` (+`playwright.dev.config.ts` to `include`), `docs/PROGRESS.md` (this entry). No changes to `ExtendBookingDialog.tsx`, any other `app/src` file, `functions`, `packages/booking-core`, or `app/vite.config.ts` — the defect was a stale local dev-server process state, not a code defect.

### Checkpoint — Phase 7 (manual-booking extensions) committed and pushed (2026-09-21)

**Status: done.** Before starting the payment-foundation work below, the completed-but-uncommitted Phase 7 extension work (and its "Dev-server blank-screen fix #2" entry above) was checkpointed per explicit instruction: reviewed the diff, re-ran typecheck/lint/unit/build (all clean, identical to the already-recorded full verification — the backend/browser/devmode emulator suites were **not** re-run since nothing in the diff had changed since that recorded pass, per the instruction to avoid repeating unchanged suites unnecessarily), found no concrete blocker, committed (`5df8af8`, "Add staff-approved one-hour extensions for unpaid manual bookings"), pushed `feature/manual-booking-extensions`, and opened **PR #3** (https://github.com/Madushan186/apex-cinema/pull/3) against `main`. **Not merged, not deployed**, per instruction. The payment-foundation phase below branches from this exact commit (`feature/payment-foundation`, based on `5df8af8`) — **it depends on PR #3 landing first**; it is not an independent branch off `main`.

### Phase 8 — Local payment foundation (local emulators only)

**Status: implemented, verified, left uncommitted for local review**, per explicit instruction ("leave the new payment implementation uncommitted"). Branch `feature/payment-foundation`, based on the Phase 7 checkpoint commit above — depends on PR #3.

#### Business decision recorded

**docs/DECISIONS.md D17** (owner-approved 2026-09-21): every new booking — online, phone, walk-in, and eventually Party — requires an LKR 1,000 cash advance before confirmation. The advance is part of the package total, not an extra fee. **Explicitly supersedes D14's prior permission to create a confirmed-but-unpaid manual booking** — D14's own text is left unedited as a historical record, with a note pointing to D17. This phase implements the advance requirement for staff/owner-entered manual bookings only (online/PayHere collection is unchanged, still not implemented — see docs/DECISIONS.md open item #3, now only partially open).

#### Backend (`functions/src`, `packages/booking-core`)

- **`packages/booking-core`**: new `ADVANCE_AMOUNT_LKR` (1000) constant; new pure helpers `currentBookingTotalMinor(totalAmountMinor, extensionChargesMinor)` and `derivePaymentStatus(amountPaidMinor, currentTotalMinor)` → `"unpaid" | "partially_paid" | "paid"`, unit-tested (5 new cases). `PaymentStatus` gained `"partially_paid"`/`"paid"`.
- **`createManualBookingTransactional`** (`lib/inventory.ts`) now requires `advanceReceivedConfirmation: true` (rejected at validation — before any Firestore read — if missing or not the literal boolean `true`; the amount itself is always the server's own constant, never client-supplied) and, in the SAME transaction as the booking + inventory writes: sets `amountPaidMinor`/a derived `paymentStatus` on the booking, and writes one immutable doc to a new `bookings/{id}/payments` subcollection (`kind: "advance"`, `method: "cash"`, `recordedByUid`, `referenceCode`, server timestamp). If the room isn't free, none of booking/inventory/payment/audit is written — verified directly (see tests below), not just reasoned through.
- **New `recordManualBookingPayment`** (`functions/src/recordManualBookingPayment.ts` → `lib/payments.ts`'s `recordManualBookingPaymentTransactional`) — staff/owner only. Reads the booking's real current `amountPaidMinor` and current total fresh inside the transaction; rejects (before any write) an amount that would overpay; otherwise updates `amountPaidMinor`/`paymentStatus` and writes one more immutable payment doc (`kind: "additional"`) plus one `auditLog` entry with a real before/after diff. Only a `bookingStatus: "confirmed"`, staff/owner-entered (manual) booking is eligible — a cancelled booking or an online hold/booking is explicitly, distinctly rejected. Idempotency is a normal create-a-resource key (fingerprint: actor+booking+amount) — no "expected balance" field needed, unlike extension, because the overpayment check already reads fresh state inside the transaction every time, so Firestore's own transaction-conflict retry is what actually prevents a concurrent race from double-applying.
- **`extendManualBookingTransactional`** — the `paymentStatus === "unpaid"`-only eligibility gate is replaced with an allow-list of the three manual-booking payment states (unpaid/partially_paid/paid); only a stray online/PayHere status is rejected now (defense-in-depth). **Bug found and fixed during this phase's own verification** (see below): the function grows `extensionChargesMinor` (and therefore the current total) but was not re-deriving `paymentStatus` against the new total — a booking that was `"paid"` a moment before an extension incorrectly stayed `"paid"` after the extension grew the total past what had actually been paid. Fixed by re-deriving and writing `paymentStatus` in the same `transaction.update` that already writes `endMinute`/`extensionCount`/`extensionChargesMinor`. `amountPaidMinor` itself is still never touched by an extension.
- **`cancelManualBookingTransactional`** — the `paymentStatus !== "unpaid"` check is replaced with `amountPaidMinor > 0` (the actual source of truth), with a new, distinct error message ("This booking has a recorded payment and cannot be cancelled until the refund policy is decided. Contact the owner."). Since every booking created under D17 always has a recorded advance, **this is a direct, intended consequence**: a booking created from now on can no longer reach cancellation through this endpoint at all, until a refund policy exists (docs/DECISIONS.md D12). A booking that predates D17 (genuinely `paymentStatus: "unpaid"`, no `amountPaidMinor` field) remains cancellable exactly as before.
- **`firestore.rules`** — two new explicit deny blocks (`paymentIdempotency/{key}`, `bookings/{bookingId}/payments/{paymentId}`), same pattern as every other collection.

#### Frontend (`app/src`)

- **`ManualBookingReview.tsx`** — replaced the old static "unpaid" notice with: the advance amount and resulting balance shown as two extra rows, an explanatory notice, and an unchecked-by-default checkbox ("I confirm the LKR 1,000 cash advance has been received from the customer") that must be explicitly checked before Confirm proceeds — an inline validation message appears if Confirm is clicked first. Labelled explicitly as recording cash already received, not collecting payment.
- **`NewManualBooking.tsx`** — wires the checkbox state (never preselected, reset only by "Create another booking"), sends `advanceReceivedConfirmation: true` only once checked, and the success screen now shows advance recorded / balance due / real payment-status badge instead of a hardcoded "Unpaid".
- **New `RecordPaymentDialog.tsx`** — total/already-paid/remaining-balance shown before confirmation, an amount field pre-filled with (but editable below) the remaining balance, client-side validation mirroring the server's, clearly labelled as recording cash already received. Wired into `StaffSchedule.tsx` via a new "Record payment" button, shown whenever a manual booking has `balanceDueMinor > 0`.
- **`scheduleFormat.ts`** — `isCancelEligible` now checks `amountPaidMinor > 0` (matches the server); `isExtendEligible` now allows all three manual payment states; new `isPaymentEligible`.
- **`StaffSchedule.tsx`** — schedule rows now show Unpaid/Partially paid (+ balance)/Paid instead of only ever "Unpaid".
- **`ExtendBookingDialog.tsx`** — the old "payment not recorded — unpaid" notice, which was wrong once a booking is no longer always unpaid, is replaced with "this does not record a payment — the charge is added to the balance due."
- **`i18n/translations.ts`** — full English + Sinhala coverage for the advance checkbox/notices, the new payment badges, and the new Record Payment dialog; the `i18n/parity.test.ts` compile-time + runtime check confirms `si` and `en` stay structurally identical.

#### A real dev-mode bug found and fixed during this phase's own verification

Running the existing `@devmode` Playwright lane (the one added specifically to catch exactly this class of bug — see the "Dev-server blank-screen fix #2" entry above) against a genuinely fresh `vite dev` server crashed identically to the earlier incident: `TypeError: Cannot read properties of undefined (reading 'toLocaleString')` at `ManualBookingReview.tsx`'s new `ADVANCE_AMOUNT_LKR.toLocaleString(...)` line. Root cause: the SAME mechanism as before — Vite's on-disk `optimizeDeps` cache for the linked `@apex-cinema/booking-core` package is keyed off a hash of `package.json`/the lockfile, not off the package's actual source content, so a genuinely fresh `vite dev` **process** can still silently reuse a **stale on-disk cache** written before a new export (`ADVANCE_AMOUNT_LKR`, added this phase) existed. `reuseExistingServer: false` guarantees a fresh process; it does not guarantee a fresh dependency scan. **Fix**: added `--force` to `playwright.dev.config.ts`'s `webServer.command`, so this suite's own dev server always does a genuinely fresh dependency scan regardless of what's on disk — verified twice in a row (previously flaked once at ~1.9 minutes under apparent one-off system load, then passed cleanly at ~7s both times after; the fix itself, `--force`, is what actually matters, not the timing). **Consequence for the developer's own live preview dev server** (which was left completely untouched throughout this task, per instruction): it was already running before `ADVANCE_AMOUNT_LKR` was added, so it carries the exact same stale cache — it will need the same restart (`VITE_DATA_MODE=emulator npm run dev --workspace app`, or simply stop/restart the existing `npm run dev` process) plus a hard browser reload before the new payment UI can be exercised there. Flagging this explicitly rather than silently leaving it for the next confusing crash.

#### Verified

Node 22, process-scoped (`/opt/homebrew/opt/node@22/bin` prefixed to individual commands only). Isolated emulator (`firebase.test.json`, project `demo-apex-cinema-test`, ports 9199/8180/5101/5183), synthetic data only — restarted fresh between runs where deterministic test dates could otherwise collide with a prior run's own leftover state in the same long-lived emulator process.

| # | Suite | Command | Result |
|---|---|---|---|
| 1 | Typecheck | `npm run typecheck` | ✅ pass |
| 2 | Lint | `npm run lint` | ✅ pass, 0 errors/warnings |
| 3 | Unit tests | `npm run test:unit` | ✅ **76/76** (26 booking-core incl. 5 new pure-function cases + 50 app, unchanged) |
| 4 | Production build (frontend) | `npm run build` | ✅ succeeds |
| 5 | Production build (functions) | `npm run build:functions` | ✅ succeeds |
| 6 | **Backend, isolated emulator** | manual isolated-instance run (own project/ports) | ✅ **145/145** (121 before this phase + 24 new: 19 in the new `manualBookingPayments.emulator.test.ts` + a handful of new/updated cases in the existing manual-booking/cancel/extend suites) |
| 7 | **Browser, isolated emulator, `@emulator`** (production build) | `npm run test:e2e:emulator` | ✅ **26/26** (25 previous + 1 new: "a booking with the D17 advance has no Cancel action") |
| 8 | **Browser, isolated emulator, `@devmode`** (real `vite dev`, `--force`) | `npm run test:e2e:devmode` | ✅ **1/1**, after the fix above |

**Every explicitly required scenario, and where it's proven:**

| Requirement | Result |
|---|---|
| Atomic booking + inventory + advance-payment + audit creation | ✅ verified directly: the advance payment doc and audit entry both exist after a successful create; a sold-out slot leaves the booking count, the audit count (scoped to that date), and the inventory interval count all unchanged — no partial write |
| Unauthorized access (guest, no-role, role-in-payload tampering) rejected | ✅ for both `createManualBooking`'s advance requirement and `recordManualBookingPayment` |
| Invalid amounts rejected before any write | ✅ zero, negative, non-integer, and an absurdly large amount are all rejected `invalid-argument`; an amount that would overpay the remaining balance is rejected `failed-precondition` (the exact remaining balance is accepted; one more LKR after that is rejected) |
| Duplicate submissions cannot double-apply | ✅ same key + same amount → identical cached result, exactly one ledger entry; same key + different amount → `already-exists`; a genuinely new payment (new key) after a prior one applies normally |
| Concurrent payment races cannot overpay | ✅ `Promise.allSettled` — two concurrent requests each for the full remaining balance: exactly one succeeds, the booking's `amountPaidMinor` lands exactly at the total (never more), exactly one additional ledger entry exists; a true concurrent double-click (same key) still produces exactly one payment |
| Additional payments update total/paid/balance/status correctly | ✅ ledger, running total, and derived status all verified after single and sequential payments, reaching exactly `"paid"` at exactly `LKR 0` balance, never a fencepost off-by-one |
| Extension increases total/balance, never amount paid | ✅ a fully-paid booking is extended (allowed, proving the D16 eligibility loosening); `amountPaidMinor` is provably unchanged; `paymentStatus` correctly reverts to `"partially_paid"` against the new, larger total (this is the bug found and fixed above, not just an untested assumption) |
| Paid-booking cancellation rejected, with a clear explanation, no silent refund/erasure | ✅ a real `createManualBooking`-created booking (always has the advance) is rejected `failed-precondition` with a message containing "recorded payment"; its `amountPaidMinor` and payment ledger are proven byte-for-byte unchanged after the rejected attempt; a legacy (pre-D17) booking with a payment patched onto it directly is rejected the same way |
| Existing unpaid cancellation preserved | ✅ a booking shaped exactly as one created before D17 (`paymentStatus: "unpaid"`, no `amountPaidMinor` field — via a direct Firestore fixture, since the real API can no longer produce this shape) cancels successfully, same as every pre-D17 test already proved |
| English, Sinhala, mobile (390px) | ✅ the advance checkbox, its validation error, the new balance/payment badges, and the Record Payment dialog are all exercised in both languages and at 390px across the updated Playwright suites |

#### Why the pre-existing browser E2E suites needed real rewrites, not just text tweaks

D17 makes every UI-created booking always carry a recorded payment, which means the UI can no longer produce a *cancellable* booking at all through the real create flow. `cancelManualBooking.emulator.spec.ts`'s cancel-dialog-interaction tests (open, required reason, Escape, badge, history, re-booking a released slot) therefore needed a booking that predates D17 to actually reach the dialog — a genuine gap in what the real UI/API can produce, not a test-authoring shortcut. New `app/e2e/adminEmulator.ts` (test-setup-only, mirrors the exact synthetic-fixture pattern already used in the Cloud Functions emulator tests) writes that legacy shape directly via the Admin SDK, validated against the same isolated-instance config every other direct-HTTP test helper in this codebase already uses (never the live preview). A new, explicit test proves the other half: a booking created via the real UI has no Cancel button at all.

#### A pre-existing test-isolation fragility surfaced (and fixed) by adding a new concurrent test file

Two "no partial write" assertions (one pre-existing, one new to this phase) counted the ENTIRE `auditLog` collection before/after a rejected operation, rather than filtering to their own test's date — safe by luck as long as no other test file happened to write an audit entry in the exact race window, but genuinely racy once `manualBookingPayments.emulator.test.ts` started running concurrently (vitest runs test files in parallel worker processes against the same emulator project). Both fixed to filter by `dateISO`, matching how every other cross-test-file-safe assertion in this codebase already scopes its reads.

#### Known limitations / honest gaps

- Online (PayHere) checkout is completely untouched — `createHold` still only computes `totalAmountMinor`, still collects nothing. No public "mark paid" endpoint, no fake payment-success button, no live PayHere/bank-transfer/email/WhatsApp/SMS integration — none of that was added, per explicit instruction.
- Party (room 6) remains entirely out of scope — the advance requirement is written to apply to Party "eventually" (per the business decision recorded in D17) but nothing about Party manual entry exists yet to apply it to.
- No refund flow exists — a paid booking that genuinely needs cancelling (e.g. a duplicate walk-in entry, a genuine customer no-show refund case) currently has no path forward except direct owner/database intervention; docs/DECISIONS.md D12 (case-by-case refund policy) is still open and this phase deliberately does not build ahead of it.
- **The LKR 1,000 advance amount is already decided for every booking type, online included (docs/DECISIONS.md D17, open item #3) — this is not an open policy question.** What's actually pending for the online path is payment **gateway selection/integration** (PayHere sandbox/live account setup, checkout flow, webhook verification — open item #12): `createHold` simply hasn't been built out yet to collect the already-decided amount. Corrected here after an earlier draft of this phase's docs incorrectly described the online advance amount itself as unresolved.

#### Files changed (uncommitted)

`packages/booking-core/src/{businessRules,types,index}.ts` + `tests/businessRules.test.ts`; `functions/src/lib/{inventory,firestore,reference,validation,schedule}.ts`, new `functions/src/lib/payments.ts`, new `functions/src/recordManualBookingPayment.ts`, `functions/src/index.ts`; `firestore.rules`; `functions/tests/{manualBooking,cancelManualBooking,extendManualBooking,firestore.rules}.emulator.test.ts` (updated) + new `functions/tests/manualBookingPayments.emulator.test.ts`; `app/src/data/firebase/staffApi.ts`, `app/src/components/staff/{ManualBookingReview,scheduleFormat,ExtendBookingDialog}.tsx` (updated) + new `app/src/components/staff/RecordPaymentDialog.tsx`, `app/src/routes/staff/{NewManualBooking,StaffSchedule}.tsx`, `app/src/i18n/translations.ts`; `app/playwright.dev.config.ts` (`--force` fix); `app/e2e/{manualBooking,cancelManualBooking,extendManualBooking,extendManualBooking.devmode}.emulator.spec.ts` (updated) + new `app/e2e/adminEmulator.ts`; `docs/DECISIONS.md` (D17, open item #3 update), `docs/ARCHITECTURE.md` (§1, §3, §4, §6), `docs/PROGRESS.md` (this section).

#### How to test one booking end to end (beginner-friendly, local preview)

Uses your own running live preview (`http://localhost:5173/staff`) — nothing here is synthetic/test data, so only do this if you're fine with it appearing in your real local preview data.

1. **Restart your dev server first** (required — see "a real dev-mode bug found" above): stop your current `npm run dev`, then start it again with `VITE_DATA_MODE=emulator npm run dev --workspace app`, and hard-reload the browser tab (Cmd+Shift+R) once it's back up.
2. Sign in at `/staff/login` as staff or owner.
3. Click **"+ New manual booking"**. Choose **AC Small** (LKR 3,200), pick any available date/time, fill in people/name/phone, click **Review booking**.
4. On the review screen you'll see: Total **LKR 3,200**, Cash advance to record now **LKR 1,000**, Balance due after advance **LKR 2,200**. Check the box **"I confirm the LKR 1,000 cash advance has been received from the customer"** — only check this if you actually intend to simulate having received cash — then click **Confirm booking**.
5. On the success screen: Advance recorded **LKR 1,000**, Balance due **LKR 2,200**, Payment status **Partially paid**.
6. Click **"← Back to schedule"**. On the schedule row, click **"Extend +1 hour"**, then **Confirm extension**. The row now shows a **Partially paid · Balance due LKR 3,200** badge (LKR 3,200 = the original LKR 2,200 balance plus the extension's own LKR 1,000 charge).
7. Click **"Record payment"**. The dialog shows Total due **LKR 4,200**, Already paid **LKR 1,000**, Remaining balance **LKR 3,200** — the amount field is pre-filled with **3200**. Click **Confirm** (or **Record payment**).
8. The row now shows a **Paid** badge, no balance shown. Notice **Cancel booking** is not offered on this row at any point after step 4 — the recorded advance blocks cancellation, per docs/DECISIONS.md D17.

#### Manual verification (2026-09-21, owner-confirmed)

You ran the exact 8-step walkthrough above yourself against your own live preview and confirmed the advance → extension → remaining-payment workflow **works correctly end to end**: LKR 3,200 total → LKR 1,000 advance recorded → LKR 2,200 balance → +1 hour extension → LKR 3,200 balance → remaining payment recorded → **Paid**. This is real, owner-performed manual verification in addition to (not a replacement for) the automated suite results above.
### Phase 9 — proposed next steps (not started, not approved)

- **9a. Resolve remaining open decisions**: party notice definition (#1) and duration (#2), the Owner-override-for-started-bookings cutoff (#6, remaining half), the payment gateway/PayHere account status (#12), the refund policy (D12) that would unblock cancelling a paid booking — needed before Party manual-entry, that override, PayHere integration, or a refund flow. (The advance amount itself — #3 — is already decided by D17 for every booking type, including online; not on this list.)
- **9b. Party (Room 6) manual entry**, with staff-set start/end time (D2's open duration question) and the LKR 1,000 advance requirement (D17) applied to it — through the same inventory transaction pattern, with its own audit entries.
- **9c. PayHere online checkout**: the advance amount is already decided (LKR 1,000, D17) — this step is pure gateway integration work, not a policy question: a real `createHold` → PayHere redirect → verified-webhook → `confirmed` flow, collecting the same already-decided LKR 1,000 advance-required principle D17 established for manual bookings. Still no live PayHere without explicit approval.
- **9d. Owner MFA**, if/when Identity Platform + Blaze billing is approved.
- **9e. Lazy-load the emulator adapters** to undo the Phase 3 bundle-size regression, if that becomes a priority before real users see the fixture-mode marketing pages.

Not started until you approve one.
