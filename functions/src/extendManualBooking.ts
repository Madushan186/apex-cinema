import { onCall } from "firebase-functions/v2/https";
import { requireRole } from "./lib/auth";
import type { ExtendManualBookingResult } from "./lib/inventory";
import { extendManualBookingTransactional } from "./lib/inventory";
import { validateExtendManualBookingRequest } from "./lib/validation";

/**
 * Staff or Owner only (docs/PROJECT_BRIEF.md "Duration & extensions",
 * docs/SECURITY.md §3 "Approve permitted extensions"). Adds exactly +60
 * minutes and +LKR 1,000 to a CONFIRMED, UNPAID, staff/owner-entered manual
 * reservation for a standard room (1–5), only when the extra hour is fully
 * conflict-free on that same room and the extension ends at or before
 * 21:00. Never changes `paymentStatus`, never collects a payment. Online
 * holds/bookings, paid bookings, and Party (room 6) are out of scope — see
 * `lib/inventory.ts`'s `extendManualBookingTransactional` for the full
 * eligibility rule, the optimistic-concurrency (`expectedCurrentEndMinute`)
 * design, and why.
 */
export const extendManualBooking = onCall(async (request): Promise<ExtendManualBookingResult> => {
  // Auth/role check first, before touching the request body at all — same
  // order as every other privileged function in this codebase.
  requireRole(request, ["staff", "owner"]);
  const validated = validateExtendManualBookingRequest(request.data);
  const actorUid = request.auth?.uid;
  if (!actorUid) {
    // Unreachable — requireRole already throws "unauthenticated" if
    // request.auth is missing — but keeps this function's types honest.
    throw new Error("requireRole did not enforce authentication.");
  }
  return extendManualBookingTransactional(validated, actorUid);
});
