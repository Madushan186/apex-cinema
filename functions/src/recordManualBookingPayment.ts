import { onCall } from "firebase-functions/v2/https";
import { requireRole } from "./lib/auth";
import type { RecordManualBookingPaymentResult } from "./lib/payments";
import { recordManualBookingPaymentTransactional } from "./lib/payments";
import { validateRecordPaymentRequest } from "./lib/validation";

/**
 * Staff or Owner only (docs/DECISIONS.md D17). Records an additional cash
 * payment already received against a confirmed, staff/owner-entered manual
 * booking — this does not collect payment itself, it records payment
 * already collected in person. Rejects an amount that would overpay the
 * booking's current balance, and rejects any attempt against a cancelled
 * booking. See `lib/payments.ts`'s `recordManualBookingPaymentTransactional`
 * for the full eligibility rule, the overpayment check, and the
 * idempotency design.
 */
export const recordManualBookingPayment = onCall(
  async (request): Promise<RecordManualBookingPaymentResult> => {
    // Auth/role check first, before touching the request body at all — same
    // order as every other privileged function in this codebase.
    requireRole(request, ["staff", "owner"]);
    const validated = validateRecordPaymentRequest(request.data);
    const actorUid = request.auth?.uid;
    if (!actorUid) {
      // Unreachable — requireRole already throws "unauthenticated" if
      // request.auth is missing — but keeps this function's types honest.
      throw new Error("requireRole did not enforce authentication.");
    }
    return recordManualBookingPaymentTransactional(validated, actorUid);
  },
);
