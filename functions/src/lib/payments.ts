import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { currentBookingTotalMinor, derivePaymentStatus } from "@apex-cinema/booking-core";
import { COLLECTIONS, db } from "./firestore";
import { fingerprintPaymentRequest } from "./reference";

/**
 * Recording an additional cash payment against an existing manual
 * reservation — docs/DECISIONS.md D17, item 3 of this phase's brief.
 * Distinct from the LKR 1,000 advance recorded at creation time
 * (lib/inventory.ts's createManualBookingTransactional) only in that this
 * can be called any number of times afterward, for any amount up to the
 * remaining balance — the advance and every later payment share the exact
 * same `bookings/{id}/payments` subcollection and the same
 * amountPaidMinor/paymentStatus fields on the booking doc, so there is only
 * ever one payment ledger per booking, never two.
 *
 * Deliberately narrow, matching this phase's scope:
 *  - Only staff/owner-entered manual bookings (`source` "staff_walkin" or
 *    "staff_phone") — online holds/bookings have no payment ledger this
 *    phase, and Party is out of scope entirely.
 *  - Only a `bookingStatus: "confirmed"` booking — explicitly rejects a
 *    cancelled booking (this phase's brief: "Do not accept payments against
 *    cancelled bookings"), and rejects anything that isn't confirmed at all
 *    (a manual booking never reaches any other status).
 *  - The amount is validated to never overpay: `amountPaidMinor + amountMinor`
 *    must not exceed the booking's CURRENT total (original price + any
 *    approved extension charges, docs/DECISIONS.md D16) — checked fresh,
 *    inside the transaction, against the real committed state every time.
 *  - Never lets a payment doc be edited or deleted — this function only
 *    ever creates a new one; there is no update/delete path anywhere in
 *    this codebase for a `bookings/{id}/payments` doc once written.
 *
 * Idempotency: like manual-booking/hold creation (and unlike extension —
 * see lib/inventory.ts's own comment on why extension is different), a
 * payment is a "create a new resource" operation, not a repeatable state
 * transition — so a normal idempotency key (fingerprinted with actor +
 * booking + amount) is sufficient by itself: a retry with the same key and
 * the same fingerprint returns the original result unchanged, no second
 * payment doc, no second amountPaidMinor increment. NO separate "expected
 * current balance" field is needed for correctness beyond that: the
 * overpayment check above always reads the booking's real, currently
 * -committed amountPaidMinor fresh inside the transaction, so two genuinely
 * concurrent payment attempts (different idempotency keys) are naturally
 * serialized by Firestore's transaction conflict-retry — whichever commits
 * first updates amountPaidMinor, and the second one's retry sees that
 * update and is correctly rejected if it would now overpay.
 */
export interface RecordManualBookingPaymentParams {
  readonly bookingId: string;
  readonly amountMinor: number;
  readonly idempotencyKey: string;
}

export interface RecordManualBookingPaymentResult {
  readonly bookingId: string;
  readonly roomId: string;
  readonly dateISO: string;
  /** The amount this call just recorded — not the running total. */
  readonly amountRecordedMinor: number;
  /** Current total owed (original price + extension charges), computed. */
  readonly totalAmountMinor: number;
  /** New running total paid, after this payment. */
  readonly amountPaidMinor: number;
  /** totalAmountMinor - amountPaidMinor, computed — 0 once fully paid. */
  readonly balanceDueMinor: number;
  readonly paymentStatus: "unpaid" | "partially_paid" | "paid";
  readonly currency: "LKR";
}

interface RawBookingForPayment {
  readonly roomId: string;
  readonly dateISO: string;
  readonly bookingStatus: string;
  readonly source?: string;
  readonly referenceCode: string;
  readonly totalAmountMinor: number;
  readonly extensionChargesMinor?: number;
  readonly amountPaidMinor?: number;
}

interface PaymentIdempotencyRecord {
  readonly fingerprint: string;
  readonly response: RecordManualBookingPaymentResult;
}

const MANUAL_BOOKING_SOURCES = new Set(["staff_walkin", "staff_phone"]);

export async function recordManualBookingPaymentTransactional(
  params: RecordManualBookingPaymentParams,
  actorUid: string,
): Promise<RecordManualBookingPaymentResult> {
  const bookingRef = db.collection(COLLECTIONS.bookings).doc(params.bookingId);
  const idempotencyRef = db.collection(COLLECTIONS.paymentIdempotency).doc(params.idempotencyKey);
  const fingerprint = fingerprintPaymentRequest({
    actorUid,
    bookingId: params.bookingId,
    amountMinor: params.amountMinor,
  });

  return db.runTransaction(async (transaction) => {
    // Firestore transactions require every read before any write.
    const idempotencySnap = await transaction.get(idempotencyRef);
    if (idempotencySnap.exists) {
      const existing = idempotencySnap.data() as PaymentIdempotencyRecord;
      if (existing.fingerprint !== fingerprint) {
        throw new HttpsError(
          "already-exists",
          "This idempotency key was already used for a different payment request.",
        );
      }
      // Exact retry: return the original result unchanged. No second payment recorded.
      return existing.response;
    }

    const bookingSnap = await transaction.get(bookingRef);
    if (!bookingSnap.exists) {
      throw new HttpsError("not-found", "Booking not found.");
    }
    const booking = bookingSnap.data() as RawBookingForPayment;

    if (booking.bookingStatus === "cancelled") {
      // Explicit, distinct message — this phase's brief: "Do not accept
      // payments against cancelled bookings."
      throw new HttpsError("failed-precondition", "This booking is cancelled — payments cannot be recorded against it.");
    }
    if (booking.bookingStatus !== "confirmed") {
      throw new HttpsError("failed-precondition", "Only a confirmed booking can receive a payment.");
    }
    if (!booking.source || !MANUAL_BOOKING_SOURCES.has(booking.source)) {
      // Excludes online (source: "online") and any future Party source —
      // this endpoint only ever records a payment against a staff/owner
      // -entered manual reservation, per this phase's scope.
      throw new HttpsError(
        "failed-precondition",
        "Only staff/owner-entered manual bookings can receive a payment here.",
      );
    }

    const currentTotalMinor = currentBookingTotalMinor(booking.totalAmountMinor, booking.extensionChargesMinor ?? 0);
    const currentPaidMinor = booking.amountPaidMinor ?? 0;
    const newPaidMinor = currentPaidMinor + params.amountMinor;

    if (newPaidMinor > currentTotalMinor) {
      // Rejected before any write — never a partial write, never an
      // overpayment recorded "just this once."
      const remainingLKR = (currentTotalMinor - currentPaidMinor) / 100;
      throw new HttpsError(
        "failed-precondition",
        `This payment would exceed the amount owed — the remaining balance is LKR ${remainingLKR.toLocaleString("en-LK")}.`,
      );
    }

    const newPaymentStatus = derivePaymentStatus(newPaidMinor, currentTotalMinor);

    transaction.update(bookingRef, {
      amountPaidMinor: newPaidMinor,
      paymentStatus: newPaymentStatus,
    });

    // An immutable ledger entry — this function only ever creates one, never
    // edits or deletes an existing payment doc (this phase's brief: "do not
    // allow arbitrary editing/deletion of payments").
    const paymentRef = bookingRef.collection(COLLECTIONS.bookingPayments).doc();
    transaction.set(paymentRef, {
      amountMinor: params.amountMinor,
      method: "cash",
      kind: "additional",
      recordedByUid: actorUid,
      referenceCode: booking.referenceCode,
      createdAt: FieldValue.serverTimestamp(),
    });

    const response: RecordManualBookingPaymentResult = {
      bookingId: params.bookingId,
      roomId: booking.roomId,
      dateISO: booking.dateISO,
      amountRecordedMinor: params.amountMinor,
      totalAmountMinor: currentTotalMinor,
      amountPaidMinor: newPaidMinor,
      balanceDueMinor: currentTotalMinor - newPaidMinor,
      paymentStatus: newPaymentStatus,
      currency: "LKR",
    };

    const idempotencyRecord: PaymentIdempotencyRecord = { fingerprint, response };
    transaction.set(idempotencyRef, { ...idempotencyRecord, createdAt: FieldValue.serverTimestamp() });

    // Audit trail with a real before/after diff (docs/SECURITY.md §8) —
    // structural/financial fields only, never customer detail.
    const auditRef = db.collection(COLLECTIONS.auditLog).doc();
    transaction.set(auditRef, {
      actorUid,
      action: "manual_booking_payment_recorded",
      targetType: "booking",
      targetId: params.bookingId,
      roomId: booking.roomId,
      dateISO: booking.dateISO,
      amountMinor: params.amountMinor,
      before: { amountPaidMinor: currentPaidMinor },
      after: { amountPaidMinor: newPaidMinor },
      createdAt: FieldValue.serverTimestamp(),
    });

    return response;
  });
}
