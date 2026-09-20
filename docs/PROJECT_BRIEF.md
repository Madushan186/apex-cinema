# Project Brief — Apex Cinema

## Business

Apex Cinema is a private cinema/gaming room rental business located in **Kurunegala, Sri Lanka** (කුරුණෑගල). Customers book a themed room for a private screening or gaming session. Domain: **apexcinema.lk**. Timezone for all business logic: **Asia/Colombo**.

Owner-confirmed 2026-09-20: the business is in Kurunegala, not Kandy (an earlier, incorrect placeholder used in marketing copy — corrected across the app; see `docs/PROGRESS.md`). No street address, coordinates, or map pin have been supplied — do not invent them; the site shows an honest "not published yet" state for these until real values exist (see `docs/DECISIONS.md`).

Hours: 09:00–21:00 daily (assume same hours every day of week unless told otherwise — **unconfirmed**, see `docs/DECISIONS.md`).

## Rooms & packages

| Room | Type | Capacity | Price | Duration | Booking channel |
|---|---|---|---|---|---|
| 1–3 | Non-AC, PS4, YouTube/Netflix on 4K projector | 3 | LKR 2,300 | 3 hours | Online self-booking |
| 4 | AC Small, same entertainment | 3 | LKR 3,200 | 3 hours | Online self-booking |
| 5 | AC Large, same entertainment | 5 | LKR 4,500 | 3 hours | Online self-booking |
| 6 | Party — AC, 4K projector, balloon decor, karaoke, JBL party box | 12 | LKR 12,500 | **Unconfirmed** | Contact-only (WhatsApp/call), staff-entered |

Rooms 1–5 are functionally identical in offering (PS4 + streaming + 4K projector); they differ only in AC and capacity/price. Room 6 (Party) is excluded from the public self-booking inventory entirely — no online slot picker shows it, no online price checkout exists for it.

## Online booking flow

1. Customer selects a **package** (which implies a room tier, not a specific room number).
2. Customer selects a **date**.
3. Customer selects an **available start time** from the fixed public slots: **09:00, 12:00, 15:00, 18:00** (Asia/Colombo). No arbitrary start time is ever offered publicly.
4. Customer enters **people count** and basic details: name, phone, and email (email required as the booking-confirmation delivery channel — see `docs/DECISIONS.md` D11; more fields only if required operationally or by the payment gateway).
5. Customer reviews a **summary**.
6. Customer is sent to **PayHere hosted checkout**.
7. Booking is confirmed only after a **verified server-side payment notification** — never on client redirect alone.

The system automatically allocates a specific physical room (1–5, matching the chosen package tier) that is free for the requested slot — the customer does not pick a room number.

## Duration & extensions

- Every standard (non-party) booking is exactly **3 hours**, matching one of the 4 fixed public start slots.
- **No cleaning/reset buffer** between bookings — a slot ends exactly when the next one starts.
- Staff can approve a **+1 hour extension** for LKR 1,000, only when:
  - the extra hour is fully conflict-free (no other booking on that room during the extension), and
  - the extension ends at or before 21:00 closing.
- Extensions affect availability for adjacent public slots even on partial overlap. Example: a 09:00–12:00 booking extended to 09:00–13:00 makes that same room's 12:00–15:00 public slot unavailable, even though only 1 of its 3 hours overlaps. Availability calculation must treat "room busy" as any interval intersection, not slot-exact matching.

## Party bookings

- Party (Room 6) is **not** part of the online flow. It is arranged by phone/WhatsApp and entered into the system by staff.
- Requires **one day's advance notice** — exact meaning (rolling 24 hours vs. "before the previous calendar day") is **unconfirmed**, see `docs/DECISIONS.md`.
- Session duration for party bookings is **not confirmed** — do not hardcode a value; the staff booking form must let staff set start/end explicitly until this is decided (or permanently, if the owner prefers staff discretion per event).

## Guest checkout

No registration, no Google login, no password, no mandatory account for customers. A completed booking is identified to the customer via a booking reference (and phone/contact confirmation) rather than an account login. Exact "look up my booking" mechanism is an architecture decision — see `docs/ARCHITECTURE.md`.

## Payment

Checkout collects a **deposit**, not necessarily full payment — the owner has confirmed deposit + balance-on-arrival is supported (`docs/DECISIONS.md` D9). The actual deposit amount/percentage is **not yet decided** — do not hardcode a figure until confirmed. Any remaining balance is collected by staff at check-in and recorded operationally. Refunds for customer-cancelled bookings are handled **case-by-case at staff/owner discretion**, not automatically (D12).

## Payment hold

Proposal (not yet implemented): a configurable **10-minute payment hold** is created on the chosen room/slot only when the customer proceeds to the PayHere checkout step — not while they are merely browsing availability. This reserves the inventory atomically so two customers can't both pay for the same slot. Hold duration should be a config value, not hardcoded, in case the owner wants it changed later.

## Roles

**OWNER**
- Manage staff accounts (create/disable/reset)
- Manage prices and settings
- View/manage all bookings
- View financial reports and audit history

**STAFF**
- Daily calendar view
- Create walk-in / phone bookings
- Check-in / check-out customers
- Enter party bookings
- Approve permitted extensions
- Record operational payments (e.g. cash for walk-ins/parties)

All privileged actions are enforced server-side (Cloud Functions + Firestore rules), never by hiding UI elements alone. Staff cancellation permissions are **not yet defined** — see `docs/DECISIONS.md`. Each staff member and the owner has their own named account; no shared logins.

## Stack

React + Vite + TypeScript, Tailwind CSS + shadcn/ui, Firebase (Hosting, Firestore, Auth, Cloud Functions in TypeScript), PayHere hosted checkout (sandbox environment first), Firebase Emulator Suite for local dev, Vitest for unit tests, Playwright for E2E. No Supabase, no Vercel-only features, no paid UI kits, no unnecessary microservices. Firebase is treated as a managed/replaceable dependency — business rules should not be tightly coupled to Firebase-specific APIs (see `docs/ARCHITECTURE.md`).

## Design

- Premium, cinematic, mobile-first, accessible, fast, and booking-focused.
- `public/brand/apex-logo.png` does not exist yet in this repo. Once supplied, it must be preserved unchanged (no re-export, no recolor, no cropping).
- Visual direction will be proposed from the actual logo once it exists — no direction is invented ahead of that.
- No fabricated reviews, room photos, contact details, or legal/policy text. Anything missing is explicitly labeled as a placeholder, not silently invented.

## Explicitly out of scope for now

Implementation, deployment, billing/paid service activation, external account changes. This phase is planning documents only.
