import { onCall } from "firebase-functions/v2/https";
import { requireRole } from "./lib/auth";
import type { CancelManualBookingResult } from "./lib/inventory";
import { cancelManualBookingTransactional } from "./lib/inventory";
import { validateCancelManualBookingRequest } from "./lib/validation";

/**
 * Staff or Owner only (docs/SECURITY.md §3: "Cancel a booking not yet
 * started" — 🟡 staff under the D10/D15 restriction, ✅ owner). Cancels a
 * CONFIRMED, UNPAID, staff/owner-entered manual reservation for a standard
 * room (1–5) whose session has not yet started, checked against the
 * server's own Asia/Colombo clock. Never changes `paymentStatus` and never
 * issues a refund. Online holds/bookings, paid bookings, and Party (room 6)
 * are out of scope — see `lib/inventory.ts`'s
 * `cancelManualBookingTransactional` for the full eligibility rule and why.
 * No Owner override for an already-started booking exists this phase
 * (docs/DECISIONS.md D15) — both roles are rejected identically there.
 */
export const cancelManualBooking = onCall(async (request): Promise<CancelManualBookingResult> => {
  // Auth/role check first, before touching the request body at all — same
  // order as every other privileged function in this codebase.
  requireRole(request, ["staff", "owner"]);
  const validated = validateCancelManualBookingRequest(request.data);
  const actorUid = request.auth?.uid;
  if (!actorUid) {
    // Unreachable — requireRole already throws "unauthenticated" if
    // request.auth is missing — but keeps this function's types honest.
    throw new Error("requireRole did not enforce authentication.");
  }
  return cancelManualBookingTransactional(validated, actorUid);
});
