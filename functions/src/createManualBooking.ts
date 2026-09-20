import { onCall } from "firebase-functions/v2/https";
import { requireRole } from "./lib/auth";
import type { CreateManualBookingResult } from "./lib/inventory";
import { createManualBookingTransactional } from "./lib/inventory";
import { validateManualBookingRequest } from "./lib/validation";

/**
 * Staff or Owner only (docs/SECURITY.md §3: "Create walk-in / phone
 * booking" — ✅ staff, ✅ owner, 🚫 everyone else). Creates a CONFIRMED
 * standard-room reservation with `paymentStatus: "unpaid"` — booking
 * confirmation is not payment confirmation (docs/PROGRESS.md, D14). No
 * payment collection, deposits, refunds, cancellation, extensions, or Party
 * bookings exist in this endpoint — see lib/inventory.ts for the full
 * scope note.
 *
 * There is deliberately no guest-accessible booking-confirmation endpoint —
 * this function is the only writer of confirmed bookings, and it always
 * requires an authenticated staff/owner caller.
 */
export const createManualBooking = onCall(async (request): Promise<CreateManualBookingResult> => {
  // Auth/role check first, same order as getStaffSchedule/getOwnerOverview —
  // never do request-shape work, let alone touch Firestore, for a caller
  // who isn't allowed here at all. requireRole never trusts request.data
  // for role, only the verified ID token (functions/src/lib/auth.ts).
  requireRole(request, ["staff", "owner"]);
  const validated = validateManualBookingRequest(request.data);
  const actorUid = request.auth?.uid;
  if (!actorUid) {
    // Unreachable — requireRole already throws "unauthenticated" if
    // request.auth is missing — but keeps this function's types honest.
    throw new Error("requireRole did not enforce authentication.");
  }
  return createManualBookingTransactional(validated, actorUid);
});
