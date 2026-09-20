# Architecture — Apex Cinema

Status: package retrieval, availability, hold creation (§3, §5, §6), Auth/roles (§8), and staff/owner manual booking creation (§3, §4, §6) are **implemented** against the local Firebase emulator — see `functions/src/` and `docs/PROGRESS.md`. PayHere (§9), prerendering (§10), and email (§7) remain planning only. No cancellation, extension, or payment-confirmation function exists yet.

## 1. High-level components

```
Browser (React SPA + prerendered marketing pages)
   │  HTTPS
   ▼
Firebase Hosting (static assets, rewrites)
   │
   ├─▶ Firestore  (read: public availability view, own booking lookup — via rules, default-deny)
   │
   └─▶ Cloud Functions (TypeScript, HTTPS callable + HTTP webhook endpoints)
            │
            ├─▶ Firestore (admin SDK — trusted writes: bookings, payments, audit log)
            ├─▶ Firebase Auth Admin (staff/owner account + custom claims management)
            └─▶ PayHere (hosted checkout redirect + server-to-server webhook/notify URL)
```

Everything that changes money, inventory, or roles happens in Cloud Functions using the Admin SDK. The browser never writes booking/payment/role data directly to Firestore.

## 2. Trust boundaries

| Boundary | Trusted side | Untrusted side | Enforcement |
|---|---|---|---|
| Browser ↔ Firestore (reads) | — | Browser | Firestore Security Rules, default-deny, narrow allow-list of read-only public docs (no PII, no prices editable, aggregated availability only) |
| Browser ↔ Cloud Functions | Function | Browser | Input validation in every callable function; never trust client-sent price, room, role, or payment status |
| Cloud Functions ↔ Firestore (writes) | Function (Admin SDK) | — | Admin SDK bypasses rules; this is the *only* path for booking/payment/role/audit writes |
| Cloud Functions ↔ PayHere | Function | PayHere response/webhook | Verify PayHere's signature/hash on every notify callback; never trust amounts or status from a client-side redirect param alone |
| Staff/Owner UI ↔ Cloud Functions | Function | Authenticated client | Every privileged function checks Firebase Auth custom claims server-side; UI role-based hiding is cosmetic only, never the actual gate |

Rule of thumb: **the browser proposes, the server disposes.** The browser can request "book Room-tier B, 2026-01-05, 15:00, 3 people" — it cannot assert a price, a room number, a payment status, or a role.

## 3. Data model (draft — Firestore collections)

This is a starting shape, to be refined when we implement. Field lists are illustrative, not final.

**Implemented so far** (see `functions/src/lib/firestore.ts` and `functions/src/lib/inventory.ts` for the real, current shape): `roomTiers`, `rooms`, `config/booking` as described below, plus two collections this draft didn't originally call out — `inventory/{roomId}_{dateISO}` — the per-room-per-date transactional occupancy lock that both `createHold` and `createManualBooking` read/write (see §6) — and `auditLog/{entryId}` (see its own entry below, now implemented, not just planned). `bookings` exists with a narrower field set than sketched below (no `extensions` subcollection, no `balanceDueLKR` yet — deposits/extensions aren't implemented). Three more small collections exist purely as implementation details, never read by anything but the functions that own them: `holdIdempotency/{key}` and `manualBookingIdempotency/{key}` (idempotency-key → cached response, one collection per operation) and `rateLimits/{key}` (abuse-protection counters).

- `roomTiers/{tierId}` — package definition: name, capacity, price (LKR, minor units), durationMinutes, active flag, isPublic (false for Room 6/Party). Editable only by OWNER function.
- `rooms/{roomId}` — physical room: roomTierId, roomNumber, active flag.
- `bookings/{bookingId}` — the core entity. See state machine below. Contains: roomId, roomTierId, date, startTime, endTime (all resolved server-side), customerName, customerPhone, peopleCount, bookingStatus, **paymentStatus** (implemented for manual bookings only so far — see below), source (`online` | `staff_walkin` | `staff_phone` | `staff_party` — `staff_party` not implemented yet, Party is fully out of scope until a future phase), createdBy (uid for staff-entered, absent for online — implemented), holdExpiresAt (for pending-payment holds), reference code (customer-facing lookup token).
- `bookings/{bookingId}/extensions/{extensionId}` — approved extension: approvedByUid, extraHour window, fee, createdAt. **Not implemented.**
- `payments/{paymentId}` — linked 1:many to a booking (a deposit payment + a later balance payment are separate docs against the same booking). paymentStatus, gatewayOrderId, gatewayPaymentId, amountDue, amountPaid, currency, rawGatewayPayload (server-verified), timestamps. Deposit amount/percentage itself is not yet decided (`docs/DECISIONS.md` open item #3) — do not hardcode a figure. **Not implemented** — this is the *online/PayHere* payment record; it's distinct from `bookings.paymentStatus` (below), which is a simpler, direct field used only for the manual-booking "unpaid" fact this phase.
- `bookings.balanceDueLKR` — running balance owed on a booking after a deposit-only payment; 0 once fully paid. Updated only by the payment-confirmation function, never client-writable. **Not implemented.**
- `availabilitySlots` — **not stored directly**; computed on read from `bookings`/`inventory` (status in confirmed/pending-hold) for a given room+date range. Keeping availability derived (not a separately-maintained cache) avoids a second source of truth that can drift. If read performance later requires a cache, it must be a strictly-derived, server-written projection — never client-written.
- `staffAccounts/{uid}` — profile metadata for staff/owner (display name, role, active flag). Role itself lives in Firebase Auth custom claims (source of truth for authorization); this doc is for display/management convenience only. **Not implemented** — role currently lives only in the Auth custom claim (§8); nothing reads/writes this doc yet.
- `auditLog/{entryId}` — append-only. **Implemented** (`functions/src/lib/inventory.ts`'s manual-booking write): `actorUid`, `action`, `targetType`/`targetId`, `roomId`, `dateISO`, `source`, `createdAt` (server timestamp). Deliberately no customer name/phone/email (docs/SECURITY.md §8 — audit entries must not duplicate PII; the `bookings` doc is the one place that lives) and no `before`/`after` diff yet (nothing being audited so far is an *edit* — creation only). Written only by Cloud Functions; `firestore.rules` denies all direct client read/write, including from an authenticated staff/owner-claimed token (defense-in-depth). No read endpoint exists yet — an owner-facing audit view is future work.
- `config/booking` (singleton doc) — business-configurable values: openTime, closeTime, publicStartTimes, holdDurationMinutes, extensionFeeLKR, etc. Editable only by OWNER function. Read by functions server-side; the public site should NOT need to read this doc directly for pricing (prices are re-derived server-side at checkout time) — it may be read for display purposes (e.g. show opening hours) since it contains no PII or security-sensitive data.

## 4. Booking status vs. payment status (kept distinct, on purpose)

Two separate state machines. A booking is never "confirmed" as a side effect of a UI event — only as a result of the payment state machine reaching `succeeded` via a verified webhook, applied through the reservation logic below.

### Booking status (`bookings.bookingStatus`)

```
              (online: hold created)         (payment succeeded, verified webhook)
pending_hold ───────────────────────▶ pending_hold ───────────────────────────────▶ confirmed
     │  (hold expires, no payment)                                                     │
     ▼                                                                                  │ (staff/owner action, policy TBD)
  expired (slot released)                                                               ▼
                                                                                     cancelled
staff-entered bookings (walk-in/phone/party) skip the hold state — **implemented for walk-in/phone** (`functions/src/lib/inventory.ts`'s `createManualBookingTransactional`), Party still not implemented:
(staff creates booking) ──▶ confirmed  (bookings.paymentStatus: "unpaid" — see below; recording an actual payment is future work)

confirmed ──(session time passes, staff checks out)──▶ completed   [not implemented]
confirmed ──(customer doesn't show)──▶ no_show   [terminology/policy TBD — see DECISIONS.md]   [not implemented]
```

States: `pending_hold`, `expired`, `confirmed`, `cancelled`, `completed`, `no_show`. Only `pending_hold`→`confirmed` (via `createHold` then `createManualBooking`'s direct-to-`confirmed` path) exist so far; `expired` is a *derived display state* (`functions/src/lib/schedule.ts`'s `deriveStatus`), never written back to the stored doc (§6).

### Payment status (`payments.paymentStatus` — the online/PayHere path, not implemented; vs. `bookings.paymentStatus` — implemented for manual bookings, see D14)

```
initiated ──▶ pending (redirected to PayHere) ──▶ succeeded
                                              └──▶ failed
                                              └──▶ cancelled_by_customer
succeeded ──(customer cancels; case-by-case owner/staff review, D12)──▶ refunded  [manual action, not automated]
```

States: `initiated`, `pending`, `succeeded`, `failed`, `cancelled_by_customer`, `refunded` — **none of these are implemented**; this whole diagram describes the future online-payment flow (`payments` collection above), still entirely planning-only.

**`bookings.paymentStatus` (implemented, manual bookings only — docs/DECISIONS.md D14):** a simpler, direct field, not the state machine above. `createManualBooking` always writes `"unpaid"` — a fixed value meaning "no payment has been collected or even attempted for this reservation," distinct from every value in the diagram above (which all imply an online PayHere attempt happened). There is no transition/edit path for it yet; recording an actual operational (cash/other) payment against a manual booking is future work (Phase 6).

**Deposit path (D9):** checkout collects a deposit, not necessarily the full price. A booking can reach `confirmed` while `bookings.balanceDueLKR > 0`. The balance is collected later — operationally by staff at check-in (cash/other, recorded as a second `payments` doc with `source: staff_recorded`), or in principle via a second online payment if that's ever built. A booking with an outstanding balance is still a fully `confirmed` booking status-wise; balance owed is tracked separately and shown on the staff calendar/check-in view so it isn't missed. Deposit amount/percentage is not yet decided — see `docs/DECISIONS.md` open item #3.

### Why separate

- A payment can succeed after its booking's hold already expired (late webhook, slow customer, network delay). Booking status and payment status must be able to disagree temporarily so the reconciliation function can detect and handle the conflict explicitly, rather than blindly flipping a single combined flag.
- Staff-entered bookings may have `confirmed` booking status with a payment status that isn't `succeeded` in the online sense at all (cash handled operationally) — a single merged field can't represent that cleanly.

### The hard case: late payment success after hold expiry

Requirement: *a late successful payment must never overwrite another booking that has since taken that slot.*

Default (proposed) handling — **not a refund policy decision, purely a safety mechanism**:
1. Webhook arrives, verified against PayHere signature.
2. Function loads the referenced booking. If `bookingStatus == pending_hold` and not expired and the slot is still free for that room/time → confirm normally (idempotent — see §6).
3. If the hold already expired **and** the slot was re-booked by someone else (another `confirmed`/`pending_hold` booking now occupies it) → do **not** confirm this booking and do **not** touch the other booking. Instead: mark this booking `expired` (unchanged) and this payment `succeeded` but flagged `requiresManualReconciliation: true`, write an audit log entry, and surface it in a staff/owner "needs attention" queue.
4. What happens to that money (refund vs. rebook the customer into a new slot vs. manual contact) is a **business policy decision the owner must make** — see `docs/DECISIONS.md`. The system's job here is only to never silently double-book or silently keep money against a lost slot without a visible flag.

## 5. Availability computation — implemented

Given a date + room tier, a public start time (09:00/12:00/15:00/18:00) is available if, for every room in that tier, there exists no booking (status `pending_hold`-not-expired or `confirmed`) whose `[startTime, endTime)` interval intersects the candidate `[startTime, startTime+3h)` — interval overlap, not slot-index equality, so extensions correctly block partially-overlapping public slots (see the 09:00–13:00 example in `PROJECT_BRIEF.md`). This is computed server-side (`functions/src/getAvailability.ts` → `lib/availability.ts`) so the response contains no booking/customer detail — the public availability read is a same-shape `{time, status, roomsFree, roomsTotal}` per slot, never a raw booking document. It's a plain (non-transactional) read — the actual double-booking guarantee lives entirely in the createHold transaction (§6), which re-checks everything atomically regardless of what a prior availability read said.

## 6. Idempotency & atomicity

- **Hold creation — implemented.** `functions/src/lib/inventory.ts`'s `createHoldTransactional` runs one `db.runTransaction`: it reads the idempotency doc and every candidate room's `inventory/{roomId}_{dateISO}` doc (all reads before any write, as Firestore requires), finds the first room with no *active* overlapping interval — an interval counts as active if it's `confirmed`, or a `pending_hold` whose `holdExpiresAtMillis` hasn't passed the function's own `Date.now()` yet — then writes the updated inventory doc, a new `bookings` doc, and an idempotency record, all in that one transaction. If Firestore detects a concurrent conflict on any read document, it retries the whole callback automatically; if no room is free, the function throws *before* any write is staged, so nothing partial is ever committed. This is the "per-room/per-business-date inventory design" — every future inventory-changing operation (payment confirmation, cancellation, an approved extension) must go through this same doc + transaction pattern, not a new one.
- **Manual booking creation — implemented**, following the exact rule above. `createManualBookingTransactional` (same file) reuses the identical `findFreeRoom`/`isActive`/`minutesOverlap` functions `createHoldTransactional` uses — same transaction, same inventory docs — so an online hold and a manual reservation contending for the last free room in a tier resolve exactly as two online holds would (confirmed by a true concurrent-race test, `functions/tests/manualBooking.emulator.test.ts`). It differs only in what it writes once a room is found free: a `confirmed` interval (not `pending_hold`) with `holdExpiresAtMillis: null` — so, because `isActive()` treats `confirmed` as always active, a manual reservation never expires — plus `bookingStatus: "confirmed"`, `paymentStatus: "unpaid"` on the booking doc, and one `auditLog` entry, all in the same transaction as the inventory write.
- **Idempotency — implemented**, for both operations. The client generates one key per attempt; `holdIdempotency/{key}` (online) / `manualBookingIdempotency/{key}` (manual, separate collection) each store a fingerprint plus the exact response returned the first time. An exact retry (same key, same fingerprint) returns that cached response unchanged — no new booking, no new inventory write, no new audit entry for the manual path. A reused key with a *different* fingerprint is rejected with `already-exists`, never silently served. The manual-booking fingerprint additionally includes the actor's uid, so a valid replay is only ever "the same" when it's the same staff/owner account resubmitting its own attempt.
- **Checkout/payment webhook**: still planning-only — no PayHere integration exists yet. When it lands, it must follow the same pattern above.
- **Expiry**: implemented as lazy check-inside-transaction (the `isActive` check above), not a scheduled sweep — deliberately, per this phase's explicit requirement to never depend on a background job or client timer for *correctness*. A booking's Firestore-level `bookingStatus` field isn't flipped to `"expired"` by any job; what actually matters — whether the slot is bookable again — is already correct the moment `holdExpiresAtMillis` passes, because the next transaction that reads that interval treats it as inactive. A future phase may still add a cosmetic sweep so stale `bookings` docs *display* as expired in a staff view, but nothing depends on it for safety.

## 7. Guest booking lookup (no accounts)

At booking creation, generate a random, non-guessable **booking reference code** (e.g. 10+ char token) shown on the confirmation screen and emailed to the customer (D11 — email chosen as the confirmation channel; email address is now a required checkout field alongside name and phone). A "find my booking" page accepts the reference code + phone number (both required, to prevent enumeration) and calls a Cloud Function that returns limited booking details. Rate-limited to prevent brute-forcing the reference code. Sending email requires a transactional email provider (e.g. SendGrid/Postmark/etc. via a Cloud Function) — provider choice is an implementation-phase decision; expect a near-free tier at this business's volume but it's still a new external dependency to account for.

## 8. Roles & authorization

- OWNER and STAFF authenticate via Firebase Auth (email/password or email link — TBD), each with their own account.
- Role is stored as a **custom claim** on the Firebase Auth user (set only by a trusted admin-side function, e.g. an owner-only "create staff account" function) — this is the authorization source of truth, checked in every privileged Cloud Function and mirrored into Firestore rules for any direct reads staff/owner UI needs.
- See `docs/SECURITY.md` for the full permissions matrix.

## 9. PayHere integration

- Hosted checkout: browser is redirected to PayHere with an order created server-side (amount, order id, hash, return URLs) — never client-assembled, so the amount can't be tampered with.
- Sandbox first; production credentials are a later, explicitly-approved step.
- Server verifies the PayHere notify (webhook) using PayHere's merchant secret and MD5 signature scheme before trusting `status_code`.
- No card number, CVV, or full payment instrument data ever reaches Apex Cinema's own systems — PayHere hosted fields handle that entirely.

## 10. SEO / prerendering for marketing pages

The app is otherwise a client-rendered SPA (booking flow doesn't need SEO). Marketing pages (home, rooms, pricing, contact/location) should be indexable. Proposed lightweight approach — no server runtime required:

- Author marketing routes as normal React components.
- At **build time**, use a small script (e.g. Vite plugin or a `react-dom/server` `renderToStaticMarkup` pass per marketing route) to emit static HTML files for those specific routes into the Hosting output.
- Firebase Hosting `rewrites` sends only the interactive app routes (e.g. `/book/**`, `/staff/**`) to the SPA `index.html`; marketing routes serve their prerendered static HTML directly (each still loads the same JS bundle for hydration/interactivity, e.g. nav, theme).
- This avoids needing Cloud Run/SSR infrastructure, keeps hosting on the free static tier, and keeps marketing pages crawlable without a headless-render service.
- Exact tool choice (hand-rolled script vs. a small plugin like `vite-plugin-ssg`) is an implementation-phase decision, not made here.

## 11. Environments & secrets

- Local dev: Firebase Emulator Suite (Auth, Firestore, Functions, Hosting) — no live Firebase project needed for day-to-day work.
- Secrets (PayHere merchant secret, etc.) live in Firebase Functions config / Secret Manager — **never** in `VITE_*` variables or anything bundled to the client.
- Three logical environments eventually: local (emulator), staging/sandbox (PayHere sandbox, a non-production Firebase project or project alias), production. Creating actual cloud projects / enabling billing is out of scope until explicitly approved.

## 12. Testing

- Vitest for unit tests (pure business logic: availability computation, state transitions, pricing) — kept deliberately decoupled from Firebase SDKs where possible so it doesn't require the emulator to run fast.
- Emulator-backed integration tests for Cloud Functions + Firestore rules (rules unit tests via `@firebase/rules-unit-testing`).
- Playwright for E2E against the emulator suite + a mocked/sandbox PayHere flow.

## 13. Provider isolation

Firebase is treated as a managed dependency, not the application's core model. Practical implication: booking/pricing/availability business logic (interval overlap, state transitions, fee calculation) is written as plain TypeScript functions taking/returning plain data, independently testable, and only *called from* thin Cloud Functions adapters that handle Firestore reads/writes and HTTP concerns. This isn't a plan to build a multi-cloud abstraction layer — it's just keeping the "what is a valid booking" logic out of Firebase-specific code so it's easy to test and reason about.
