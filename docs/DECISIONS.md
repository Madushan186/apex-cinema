# Decisions — Apex Cinema

Two kinds of entries here: **decided** (engineering choices made and why) and **open** (business/policy questions only the owner can answer — engineering will not silently default these).

## Open — needs owner decision

These are not decided. Where a "safe default" is proposed, it's a suggestion to unblock engineering, not a decision — flag before it's relied upon in a real launch.

1. **Party advance notice: 24 rolling hours, or "before the previous calendar day"?**
   Spec says party requires one day's advance notice but doesn't say which rule. Example of why it matters: a customer calls Tuesday at 6pm wanting a Wednesday 10am party — that's <24 hours but is technically "before the day of." Need the actual rule staff use.

2. **Party session duration.**
   Not specified anywhere. Do NOT hardcode a value. Until decided, staff-entered party bookings should let staff set start/end time directly. Is duration fixed (and if so, how long) or does it vary per event/negotiation?

3. **Deposit / balance split.**
   Decided in principle (see D9 below): deposits are supported, not just full-payment-upfront. Still open: **what's the actual deposit amount or percentage**, and is it the same across all room tiers or does it vary? Until answered, no deposit amount is hardcoded.
   **Still respected as of the booking-engine phase (2026-09-20)**: `createHold` computes `totalAmountMinor` as the package's full price (server-side, integer minor units) and stops there — it does not implement a payment/confirm step at all, deliberately, because building one would have forced a guess at full-vs-deposit. Flagging here rather than picking a number, per this phase's explicit instruction not to invent one.

5. **Customer cancellation window.**
   Can a customer cancel/reschedule their own online booking at all (e.g. via the booking-lookup page), and if so, until how long before the session? Currently assumed **no self-service cancellation** — only staff/owner can change a booking's status — until a window is defined.

6. **Staff cancellation restriction — exact rule.**
   Decided in principle (see D10 below): staff can cancel, but only under restrictions, not unconditionally. Still open: what's the actual cutoff/condition? A default is proposed in D10 (only bookings that haven't started yet, reason note required) — needs explicit owner sign-off before it's relied upon, since a wrong default here has real operational impact (a staff member unable to cancel a booking that legitimately needs cancelling, or over-broad cancellation power).

8. **No-show handling.**
   Is there a formal "no-show" outcome distinct from "completed," and does it have any policy implication (e.g. affects future bookings, no refund)? Assumed it exists as a status for reporting purposes only, no automated consequence, until told otherwise.

9. **Late-payment-success reconciliation (technical default proposed, needs sign-off).**
   See `docs/ARCHITECTURE.md` §4 "the hard case." Proposed default: never overwrite a slot that was rebooked; flag the late-succeeded payment for manual staff/owner reconciliation instead of auto-resolving it. This is a safety default, not a decision about what actually happens to that customer/money — that's tied to the refund policy above (#3).

10. **Data retention period for bookings/payments/audit log.**
    Any Sri Lanka-specific accounting/legal retention requirement to follow, or is "keep indefinitely until owner deletes" fine?

11. **Opening hours: same every day of the week?**
    Spec gives one set of hours (09:00–21:00) and doesn't mention day-of-week variation (e.g. different hours on Poya days/holidays). Assumed **same hours every day** until told otherwise.

12. **PayHere account status.**
    Does the business already have a PayHere merchant account (sandbox and/or live), or does that need to be set up before payment integration can be tested end-to-end? This affects sequencing of a later phase.

## Decided — engineering choices

| # | Decision | Rationale |
|---|---|---|
| D1 | Firestore is default-deny; all booking/payment/role writes go through Cloud Functions using the Admin SDK, never direct client writes. | Required by the security spec — no client-controlled prices/roles/payment status. |
| D2 | Availability is computed server-side from `bookings`, not stored as a separately-maintained collection. | Avoids a second source of truth that can drift from actual booking data. |
| D3 | Booking status and payment status are two separate state machines, joined by a payment→booking transition function. | Explicitly required — needed to correctly represent late/conflicting payment webhooks without corrupting booking state. |
| D4 | Guest "find my booking" requires reference code + phone together, rate-limited. | Neither alone is a strong enough secret; combination + rate limiting resists brute force without requiring an account. |
| D5 | Marketing pages are prerendered at build time to static HTML; the booking app itself stays client-rendered SPA. | Keeps SEO indexability without standing up SSR/Cloud Run infrastructure — matches "lightweight prerendering" requirement and free Hosting tier. |
| D6 | Owner MFA requires enabling Identity Platform + Blaze billing on the Firebase project. | This is a real cost/process prerequisite (see `docs/SECURITY.md` §5), not a pure engineering choice — flagged here so it isn't silently skipped, but actual enablement needs explicit approval when we reach that phase. |
| D7 | Payment hold duration is a config value (default proposal: 10 minutes), not hardcoded. | Spec asked for "configurable" — owner may want to tune it after observing real checkout times. |
| D8 | Room 6 (Party) is fully excluded from public self-booking inventory and availability computation. | Explicit spec requirement — party is staff-entered only. |
| D9 | Payment supports a deposit + balance-on-arrival path, not just full-payment-upfront. Payment state machine and `payments` doc gain an `amountDue`/`amountPaid` split and a `partially_paid` state; booking can be `confirmed` with a balance still owed. Actual deposit amount/percentage is **not yet decided** (open item #3). | Owner-confirmed 2026-09-19. This is a real scope increase over the original "full payment via hosted checkout" reading of the spec — flagging so it isn't lost: it means the checkout flow needs a deposit-amount step, and staff need an on-site "collect balance" action (cash/other) recorded operationally at check-in. |
| D10 | Staff can cancel bookings, but only under restriction, not unconditionally. Proposed default restriction (needs explicit confirmation before relied upon): staff may cancel a booking only if its session has not yet started, and must enter a reason note (written to `auditLog`); cancelling an in-progress or past booking requires OWNER. | Owner-confirmed 2026-09-19 that *some* restriction should apply; the specific rule above is a proposed default only (see open item #6) — chosen because it lets staff handle the common case (customer calls ahead to cancel) without giving blanket power to erase a booking already in use or already completed. |
| D11 | Guest booking confirmation is delivered by **email**. Email address becomes a required checkout field (previously only name + phone were required). | Owner-confirmed 2026-09-19. Chosen as the lowest-cost, no-gateway-dependency option to start with; SMS/WhatsApp can be added later without re-architecting (confirmation delivery is already planned as a discrete step, see ARCHITECTURE.md §7). |
| D12 | Cancellation refunds are **case-by-case, staff/owner discretion** — no automated refund rule or cutoff window is built. A customer-cancelled booking is flagged for manual review; any refund is actioned manually (e.g. via PayHere's merchant dashboard or a manual process) rather than by an automated Cloud Function refund call. | Owner-confirmed 2026-09-19. Avoids building and maintaining automated refund logic against a policy that doesn't exist yet; keeps a human in the loop for every refund, which also naturally satisfies audit/accountability needs. Can be automated later if a consistent rule emerges. |
| D13 | The business is located in **Kurunegala, Sri Lanka** (කුරුණෑගල), not Kandy. Corrected across hero copy in both languages (`i18n/translations.ts`). | Owner-confirmed 2026-09-20. "Kandy" was an unapproved placeholder city introduced while writing marketing copy during the customer-UI phase — a fabrication that should not have been in the copy in the first place; corrected as soon as flagged. No street address, coordinates, or map pin have been supplied — those stay unset (honest "not published yet" state) rather than invented. |
| D14 | A staff/owner manual booking is written with `bookings.paymentStatus: "unpaid"` — a fixed value, not editable this phase, and not part of the online `payments.paymentStatus` state machine (ARCHITECTURE.md §4). Booking confirmation (`bookingStatus: "confirmed"`) never implies payment received. | Directly specified in the manual-bookings phase brief, 2026-09-20 — not an engineering default: the exact semantics ("confirmed room reservation with payment status UNPAID... booking confirmation does not mean payment received") were given verbatim. Recorded as decided rather than open because it's a stated requirement, not a policy question needing owner sign-off. Recording an actual payment against a manual booking (and what `paymentStatus` values exist beyond `"unpaid"` for that path) is future work — see Phase 6 in docs/PROGRESS.md. |
