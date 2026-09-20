# Progress — Apex Cinema

## How to resume

At the start of any session: read `CLAUDE.md`, then this file, then skim `docs/DECISIONS.md` for any open questions that got answered since last time. Propose the next phase's scope, get approval, then implement only that phase.

## Environment notes (updated 2026-09-20)

- Repo: no commits yet, branch `main`. Nothing has been committed by any session — everything described below exists on disk, staged for the user to commit when ready.
- Node: v26.5.0, npm 11.17.0.
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

**Resolved on 2026-09-19 (owner answered via question round):** deposit + balance-on-arrival is supported (D9, exact amount still open — DECISIONS.md #3); staff can cancel bookings under restriction, proposed default rule needs sign-off (D10, DECISIONS.md #6); booking confirmation goes by email, now a required checkout field (D11); cancellation refunds are case-by-case, manual, no automated refund flow (D12).

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

### Phase 5 — proposed next steps (not started, not approved)

- **5a. Resolve remaining open decisions**: exact deposit amount (#3), party notice definition (#1) and duration (#2), staff-cancellation cutoff (#6) — needed before payment/confirmation or manual-booking work.
- **5b. Staff/owner mutations**: cancellation, extension approval, and manual (phone-arranged, including Party) booking entry — all through the existing inventory transaction pattern, with an audit trail per docs/SECURITY.md §3.
- **5c. Payment confirmation**: once the deposit question is answered, a `confirmBooking`-style function transitioning `pending_hold` → `confirmed` — still no live PayHere without explicit approval.
- **5d. Owner MFA**, if/when Identity Platform + Blaze billing is approved.
- **5e. Lazy-load the emulator adapters** to undo the Phase 3 bundle-size regression, if that becomes a priority before real users see the fixture-mode marketing pages.

Not started until you approve one.
