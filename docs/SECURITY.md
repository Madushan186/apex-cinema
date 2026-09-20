# Security — Apex Cinema

Status: **planning only**, nothing implemented yet. This document defines the security model implementation phases must follow. It is not a certification of security — see §9.

## 1. Trust boundaries (summary; full detail in ARCHITECTURE.md §2)

- Browser is always untrusted. It can request actions; it cannot assert facts (price, role, payment status, room number).
- Firestore Security Rules are **default-deny**. Every collection needs an explicit, narrow allow rule. No blanket `allow read, write: if true` or `if request.auth != null` without field-level constraints on sensitive collections.
- Cloud Functions (Admin SDK) are the only writer of bookings, payments, roles, prices, and the audit log.
- PayHere webhook payloads are untrusted until their signature/hash is verified against the merchant secret held server-side.

## 2. Data classification

| Data | Classification | Public read? |
|---|---|---|
| Room tiers, prices, open hours, fixed start times | Public, non-sensitive | Yes |
| Aggregated slot availability (free/full per tier/date/time) | Public, non-sensitive | Yes — must not leak names/phones/exact booking docs |
| Customer name, phone, email, people count | PII | No — never in a public-readable doc |
| Payment gateway identifiers, raw gateway payloads | Sensitive/financial | No |
| Booking reference/lookup token | Sensitive (bearer-token-like) | No — only resolvable via a rate-limited function with matching phone |
| Staff/owner identity, role claims | Sensitive | No (staff/owner only, own org) |
| Audit log | Sensitive, financial/compliance | Owner only |

**No customer or payment PII ever appears in the data path that powers the public availability view.** That view is computed server-side and returns only boolean/slot-shape data.

## 3. Permissions matrix

Legend: ✅ allowed, 🚫 denied, 🟡 conditional (see note).

| Action | Public / Guest | Customer w/ booking ref + phone | STAFF | OWNER |
|---|---|---|---|---|
| View room tiers, prices, hours | ✅ | ✅ | ✅ | ✅ |
| View aggregated public availability | ✅ | ✅ | ✅ | ✅ |
| Create a hold + online booking (self, via checkout) | ✅ | ✅ | ✅ (as staff, walk-in path) | ✅ |
| Look up own booking (ref code + phone) | 🚫 | ✅ (own booking only) | ✅ | ✅ |
| View any/all bookings | 🚫 | 🚫 | ✅ | ✅ |
| Create walk-in / phone booking | 🚫 | 🚫 | ✅ | ✅ |
| Create party (Room 6) booking | 🚫 | 🚫 | ✅ | ✅ |
| Check-in / check-out a booking | 🚫 | 🚫 | ✅ | ✅ |
| Approve a standard extension | 🚫 | 🚫 | ✅ | ✅ |
| Cancel a booking not yet started | 🚫 | 🚫 | 🟡 D10 default: allowed, reason note required — exact rule needs owner sign-off, see DECISIONS.md #6 | ✅ |
| Cancel an in-progress or past booking | 🚫 | 🚫 | 🚫 | ✅ |
| Record an operational (cash/offline) payment, incl. balance collection at check-in | 🚫 | 🚫 | ✅ | ✅ |
| Edit prices / room tiers / config / deposit amount | 🚫 | 🚫 | 🚫 | ✅ |
| Create/disable staff accounts | 🚫 | 🚫 | 🚫 | ✅ |
| View financial reports | 🚫 | 🚫 | 🚫 | ✅ |
| View audit log | 🚫 | 🚫 | 🚫 | ✅ |
| Issue a refund | 🚫 | 🚫 | 🚫 | ✅ (manual, case-by-case per D12 — no automated refund function) |

Every ✅/🟡 above must be enforced **inside the Cloud Function** (role check via custom claims) and, where the client reads Firestore directly at all, mirrored in Security Rules. UI hiding of buttons is cosmetic only and never the actual control.

## 4. Authentication

- Customers: no authentication. Guest checkout only, as specified. "Find my booking" uses possession of (reference code + phone), not an account — this is a weaker guarantee than login and must be rate-limited (§6) to resist brute-forcing.
- Staff/Owner: individual Firebase Auth accounts, no shared credentials. Password (or email-link) sign-in; exact method is an implementation-phase choice, but must support MFA for the owner (below) regardless of choice.

## 5. Owner MFA

Requirement: owner account must use a supported MFA flow. Prerequisites/costs to resolve before implementation:

- Firebase Auth's built-in **multi-factor authentication (SMS-based, and newer TOTP support)** requires the project to be upgraded to **Identity Platform** (Google Cloud's superset of Firebase Auth). This is **not** part of the Firebase free (Spark) tier feature set for MFA — Identity Platform has its own pricing (free allotment of MAUs, then per-MAU cost) and requires the project to be on the **Blaze (pay-as-you-go)** billing plan.
- Practical implication: enabling owner MFA is inherently a "turn on a paid GCP feature" decision, even though actual cost at single-owner scale is likely near-zero (well under any free tier threshold). It still requires explicit owner approval to enable billing on the Firebase project, per the standing rule that nothing gets deployed/billed without approval.
- TOTP (authenticator app) MFA avoids ongoing per-SMS cost (SMS MFA has a per-verification cost); TOTP is the recommended flow once Identity Platform is enabled, but the enablement step itself is what needs sign-off.
- Until MFA is enabled, the owner account should still use a strong, unique password as a baseline — MFA is an enhancement to add in the phase that also enables Blaze billing, not a blocker to starting the project.

## 6. Abuse protection & rate limiting

- All public-facing callable functions (availability check, hold creation, booking lookup) must enforce bounded request rates (e.g. per-IP and/or per-phone-number throttling) to resist scraping and brute-force lookup of booking reference codes.
- Booking lookup requires **both** reference code and phone number together — neither alone is sufficient — to make enumeration impractical.
- Hold creation should be constrained (e.g. a cap on concurrent unpaid holds per IP/phone within a short window) to prevent inventory-lockout abuse (someone creating holds on all slots to deny other customers, without ever paying).
- Cloud Functions should log request metadata for anomaly review but must not log full PII, card data, or secrets in plaintext logs (§8).
- Firestore Rules should never allow unauthenticated list/query operations over collections containing PII or financial data — only targeted `get`s the app's own flow needs, or nothing at all if the flow goes through a function instead.

## 7. Payment security

- No card number, CVV, or other cardholder data ever touches Apex Cinema's servers or client code — PayHere's hosted checkout fields handle that entirely (this keeps PCI-DSS scope minimal — effectively SAQ-A-like, since the merchant never sees card data).
- The PayHere merchant secret and any API credentials live in server-side secret storage (Firebase Functions secrets / Google Secret Manager), never in `VITE_*` variables, never committed to the repo.
- Every webhook/notify callback is verified against PayHere's hash/signature scheme before any booking/payment state changes. Unverified callbacks are logged and discarded, not acted on.
- Idempotency keys (PayHere's order/payment id) prevent duplicate-processing of retried webhooks (see ARCHITECTURE.md §6).

## 8. Logging & audit

- Sensitive operations (price change, staff account create/disable, role change, booking cancellation, extension approval, refund if/when implemented) are written to an append-only `auditLog` with actor, action, target, timestamp, and a before/after diff with any secrets/PII redacted.
- Application logs (Cloud Functions logs) must not contain full customer phone numbers, payment tokens, or gateway secrets in plaintext — redact or truncate before logging.
- Audit log itself is OWNER-read-only (§3) and never client-writable.

## 9. Backups & restore

- Firestore supports scheduled exports to Cloud Storage; this project will use scheduled backups once live data exists.
- A backup is only as good as a **tested restore** — the implementation plan must include an actual restore drill (restore an export into a separate/emulator project and verify data integrity), not just "backups are configured."
- Financial history (bookings, payments, audit log) must be retained per whatever retention period the owner decides is appropriate (not yet defined — flag in DECISIONS.md if a specific legal/accounting retention requirement applies in Sri Lanka).
- Backup storage costs are a line item to flag before enabling (small at this scale, but non-zero and billing-tier-gated like MFA above).

## 10. No absolute claims

This system will be built to reduce risk using standard, current practices (default-deny rules, server-side validation, verified webhooks, no PII in public data, least-privilege roles, MFA for the owner, audit logging). It will **not** be described or represented as "100% secure" at any point — no system is. Security work continues after initial launch (dependency updates, monitoring, periodic review), not as a one-time checkbox.
