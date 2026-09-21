import { createHash, randomBytes } from "node:crypto";

/** Random, non-guessable customer-facing booking reference — see docs/ARCHITECTURE.md §7. */
export function generateReferenceCode(): string {
  const raw = randomBytes(6).toString("hex").toUpperCase(); // 12 hex chars, ~48 bits of entropy
  return `APX-${raw}`;
}

/**
 * Deterministic fingerprint of the meaningful request fields, used to detect
 * idempotency-key reuse with a *different* request (which must be rejected,
 * not silently served from the wrong cached response).
 */
export function fingerprintHoldRequest(input: {
  packageId: string;
  dateISO: string;
  time: string;
  peopleCount: number;
  email: string;
}): string {
  const canonical = [input.packageId, input.dateISO, input.time, input.peopleCount, input.email].join("|");
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Same purpose as fingerprintHoldRequest, for createManualBooking. Includes
 * `actorUid` (unlike the guest hold fingerprint, which has no actor) so a
 * retry is only ever "the same" when it's the same staff/owner account
 * replaying its own attempt with the same key and payload — see
 * docs/PROGRESS.md "same actor/key/payload returns the same reservation."
 */
export function fingerprintManualBookingRequest(input: {
  actorUid: string;
  packageId: string;
  dateISO: string;
  time: string;
  peopleCount: number;
  name: string;
  phone: string;
  email: string;
  source: string;
}): string {
  const canonical = [
    input.actorUid,
    input.packageId,
    input.dateISO,
    input.time,
    input.peopleCount,
    input.name,
    input.phone,
    input.email,
    input.source,
  ].join("|");
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Same purpose as fingerprintManualBookingRequest, for extendManualBooking.
 * Includes `expectedCurrentEndMinute` — a retry of the exact same approval
 * (same key, same expected end time, same actor) is idempotent and no-ops;
 * a *different* expected end time under a reused key is a genuinely
 * different request (rejected as `already-exists`, never silently applied
 * on top of a stale assumption) — see docs/DECISIONS.md D16.
 */
export function fingerprintExtensionRequest(input: {
  actorUid: string;
  bookingId: string;
  expectedCurrentEndMinute: number;
}): string {
  const canonical = [input.actorUid, input.bookingId, input.expectedCurrentEndMinute].join("|");
  return createHash("sha256").update(canonical).digest("hex");
}
