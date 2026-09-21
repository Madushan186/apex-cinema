import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (getApps().length === 0) {
  // No explicit credentials/config: in the emulator this talks only to the
  // local Firestore emulator (FIRESTORE_EMULATOR_HOST is set by
  // `firebase emulators:exec`/`emulators:start`). There is no production
  // fallback wired anywhere in this codebase — see docs/PROGRESS.md.
  initializeApp();
}

export const db = getFirestore();

/**
 * Collection names in one place. All of these are default-denied to direct
 * client reads/writes by firestore.rules — every read/write here goes
 * through the Admin SDK from inside a Cloud Function, which bypasses rules
 * entirely, so the *actual* access control is the code in this directory,
 * not the rules file (see docs/ARCHITECTURE.md §2 and CLAUDE.md rule 5).
 */
export const COLLECTIONS = {
  roomTiers: "roomTiers",
  rooms: "rooms",
  /** One doc per (roomId, businessDate) — the transactional inventory lock. See lib/inventory.ts. */
  inventory: "inventory",
  bookings: "bookings",
  holdIdempotency: "holdIdempotency",
  /** Idempotency records for createManualBooking — kept separate from holdIdempotency since it's a different operation/response shape. */
  manualBookingIdempotency: "manualBookingIdempotency",
  /** Idempotency + expected-state records for extendManualBooking — see lib/inventory.ts's extendManualBookingTransactional. */
  extensionIdempotency: "extensionIdempotency",
  /** Subcollection name under bookings/{bookingId} — one doc per approved extension (docs/ARCHITECTURE.md §3, now implemented). */
  bookingExtensions: "extensions",
  rateLimits: "rateLimits",
  config: "config",
  /** Append-only, Cloud-Functions-only writes (docs/ARCHITECTURE.md §3, docs/SECURITY.md §8). No customer PII — see lib/inventory.ts's manual-booking audit write. */
  auditLog: "auditLog",
} as const;

export function inventoryDocId(roomId: string, dateISO: string): string {
  return `${roomId}_${dateISO}`;
}
