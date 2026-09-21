import type { BookablePackageId, PackageId, PaymentStatus, SlotTime } from "@apex-cinema/booking-core";
import { FirebaseError } from "firebase/app";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";

export type DisplayStatus = "active-hold" | "expired-hold" | "confirmed" | "cancelled" | "other";

export interface ScheduleBooking {
  readonly bookingId: string;
  readonly packageId: PackageId;
  readonly roomId: string;
  readonly startMinute: number;
  readonly endMinute: number;
  readonly displayStatus: DisplayStatus;
  readonly holdExpiresAtMillis: number | null;
  readonly peopleCount: number;
  readonly customerName: string;
  readonly customerPhone: string;
  readonly referenceCode: string;
  /** Present only for manual reservations this phase — see docs/DECISIONS.md D14. */
  readonly paymentStatus: PaymentStatus | null;
  /** "staff_walkin" | "staff_phone" | "online" | null. Cosmetic input to the cancel-button eligibility check only — the server re-checks everything. */
  readonly source: string | null;
  /** Staff-authored reason, present only once cancelled. */
  readonly cancellationReason: string | null;
  /** Original package price, minor units — never changed by an extension. Present only on manual reservations. */
  readonly totalAmountMinor: number | null;
  /** Number of approved +1 hour extensions so far — 0 if none. */
  readonly extensionCount: number;
  /** Sum of all extension fees, minor units — 0 if none. */
  readonly extensionChargesMinor: number;
}

export interface ScheduleCounts {
  readonly total: number;
  readonly activeHolds: number;
  readonly expiredHolds: number;
  readonly confirmed: number;
}

const getStaffScheduleCallable = httpsCallable<
  { dateISO: string },
  { dateISO: string; bookings: readonly ScheduleBooking[] }
>(functions, "getStaffSchedule");

const getOwnerOverviewCallable = httpsCallable<
  { dateISO: string },
  { dateISO: string; counts: ScheduleCounts }
>(functions, "getOwnerOverview");

/** Staff or Owner — see functions/src/getStaffSchedule.ts. Rejects (permission-denied/unauthenticated) if the caller isn't signed in with an approved role. */
export async function getStaffSchedule(dateISO: string): Promise<readonly ScheduleBooking[]> {
  const result = await getStaffScheduleCallable({ dateISO });
  return result.data.bookings;
}

/** Owner only — see functions/src/getOwnerOverview.ts. */
export async function getOwnerOverview(dateISO: string): Promise<ScheduleCounts> {
  const result = await getOwnerOverviewCallable({ dateISO });
  return result.data.counts;
}

export type ManualBookingSource = "staff_walkin" | "staff_phone";

export interface CreateManualBookingInput {
  readonly packageId: BookablePackageId;
  readonly dateISO: string;
  readonly time: SlotTime;
  readonly peopleCount: number;
  readonly name: string;
  readonly phone: string;
  /** "" when not given — optional for manual reservations. */
  readonly email: string;
  readonly source: ManualBookingSource;
  /** "" when not given. */
  readonly staffNote: string;
  /** Client-generated once per submission attempt; a retry must reuse the same key. */
  readonly idempotencyKey: string;
}

export interface ManualBookingResult {
  readonly bookingId: string;
  readonly referenceCode: string;
  readonly roomId: string;
  readonly totalAmountMinor: number;
  readonly currency: "LKR";
  readonly startISO: string;
  readonly endISO: string;
  readonly paymentStatus: "unpaid";
}

/** Discriminated failure reasons the manual-booking form needs to render distinct, honest messages for — same shape as data/types.ts's HoldError. */
export type ManualBookingErrorReason = "unavailable" | "invalid-request" | "idempotency-conflict" | "unknown";

export class ManualBookingError extends Error {
  constructor(
    public readonly reason: ManualBookingErrorReason,
    message: string,
  ) {
    super(message);
    this.name = "ManualBookingError";
  }
}

function mapManualBookingErrorCode(code: string): ManualBookingErrorReason {
  switch (code) {
    case "functions/failed-precondition":
      return "unavailable";
    case "functions/invalid-argument":
      return "invalid-request";
    case "functions/already-exists":
      return "idempotency-conflict";
    default:
      return "unknown";
  }
}

const createManualBookingCallable = httpsCallable<CreateManualBookingInput, ManualBookingResult>(
  functions,
  "createManualBooking",
);

/**
 * Staff or Owner — see functions/src/createManualBooking.ts. Creates a
 * CONFIRMED standard-room reservation with paymentStatus "unpaid"; never a
 * hold, never a paid booking (docs/PROGRESS.md).
 */
export async function createManualBooking(input: CreateManualBookingInput): Promise<ManualBookingResult> {
  try {
    const result = await createManualBookingCallable(input);
    return result.data;
  } catch (error) {
    if (error instanceof FirebaseError) {
      throw new ManualBookingError(mapManualBookingErrorCode(error.code), error.message);
    }
    throw new ManualBookingError("unknown", "Something went wrong creating this booking. Please try again.");
  }
}

export interface CancelManualBookingInput {
  readonly bookingId: string;
  readonly reason: string;
}

export interface CancelManualBookingResult {
  readonly bookingId: string;
  readonly bookingStatus: "cancelled";
  readonly cancelledAtMillis: number;
  readonly cancelledBy: string;
  readonly roomId: string;
  readonly dateISO: string;
}

/** Discriminated failure reasons the cancel dialog needs to render distinct, honest messages for. */
export type CancelManualBookingErrorReason = "not-found" | "ineligible" | "invalid-request" | "unknown";

export class CancelManualBookingError extends Error {
  constructor(
    public readonly reason: CancelManualBookingErrorReason,
    message: string,
  ) {
    super(message);
    this.name = "CancelManualBookingError";
  }
}

function mapCancelManualBookingErrorCode(code: string): CancelManualBookingErrorReason {
  switch (code) {
    case "functions/not-found":
      return "not-found";
    case "functions/failed-precondition":
      return "ineligible";
    case "functions/invalid-argument":
      return "invalid-request";
    default:
      return "unknown";
  }
}

const cancelManualBookingCallable = httpsCallable<CancelManualBookingInput, CancelManualBookingResult>(
  functions,
  "cancelManualBooking",
);

/**
 * Staff or Owner — see functions/src/cancelManualBooking.ts. Cancels a
 * CONFIRMED, UNPAID, staff/owner-entered manual reservation for a standard
 * room whose session has not yet started. Never changes payment status,
 * never issues a refund. Idempotent — cancelling an already-cancelled
 * booking succeeds and returns the original cancellation, so a retry after
 * a network error or a double-click is always safe to call again.
 */
export async function cancelManualBooking(input: CancelManualBookingInput): Promise<CancelManualBookingResult> {
  try {
    const result = await cancelManualBookingCallable(input);
    return result.data;
  } catch (error) {
    if (error instanceof FirebaseError) {
      throw new CancelManualBookingError(mapCancelManualBookingErrorCode(error.code), error.message);
    }
    throw new CancelManualBookingError("unknown", "Something went wrong cancelling this booking. Please try again.");
  }
}

export interface ExtendManualBookingInput {
  readonly bookingId: string;
  /** What the caller believes the booking's CURRENT end time is — captured when the confirmation dialog opened, sent back so the server can detect a stale/conflicting request. */
  readonly expectedCurrentEndMinute: number;
  /** Client-generated fresh per approval attempt; a retry of the SAME approval must reuse the same key — a genuinely new, later approval must use a new one. */
  readonly idempotencyKey: string;
}

export interface ExtendManualBookingResult {
  readonly bookingId: string;
  readonly roomId: string;
  readonly dateISO: string;
  readonly startMinute: number;
  readonly previousEndMinute: number;
  readonly newEndMinute: number;
  readonly extensionFeeMinor: number;
  readonly totalAmountMinor: number;
  readonly extensionCount: number;
  readonly extensionChargesMinor: number;
  readonly newTotalAmountMinor: number;
  readonly currency: "LKR";
}

/** Discriminated failure reasons the extend dialog needs to render distinct, honest messages for. */
export type ExtendManualBookingErrorReason = "not-found" | "ineligible" | "invalid-request" | "stale-state" | "idempotency-conflict" | "unknown";

export class ExtendManualBookingError extends Error {
  constructor(
    public readonly reason: ExtendManualBookingErrorReason,
    message: string,
  ) {
    super(message);
    this.name = "ExtendManualBookingError";
  }
}

function mapExtendManualBookingErrorCode(code: string): ExtendManualBookingErrorReason {
  switch (code) {
    case "functions/not-found":
      return "not-found";
    case "functions/failed-precondition":
      return "ineligible";
    case "functions/invalid-argument":
      return "invalid-request";
    case "functions/aborted":
      return "stale-state";
    case "functions/already-exists":
      return "idempotency-conflict";
    default:
      return "unknown";
  }
}

const extendManualBookingCallable = httpsCallable<ExtendManualBookingInput, ExtendManualBookingResult>(
  functions,
  "extendManualBooking",
);

/**
 * Staff or Owner — see functions/src/extendManualBooking.ts. Adds exactly
 * +60 minutes and +LKR 1,000 to a CONFIRMED, UNPAID, staff/owner-entered
 * manual reservation for a standard room, only when the extra hour is free
 * on that same room and the extension ends at or before 21:00. Never
 * changes payment status, never collects a payment. `stale-state` means
 * the booking has changed since the caller last looked at it (e.g. someone
 * else extended or cancelled it in the meantime) — the caller must refresh
 * and, if it's still wanted, submit a fresh request with the current end
 * time and a new idempotency key.
 */
export async function extendManualBooking(input: ExtendManualBookingInput): Promise<ExtendManualBookingResult> {
  try {
    const result = await extendManualBookingCallable(input);
    return result.data;
  } catch (error) {
    if (error instanceof FirebaseError) {
      throw new ExtendManualBookingError(mapExtendManualBookingErrorCode(error.code), error.message);
    }
    throw new ExtendManualBookingError("unknown", "Something went wrong extending this booking. Please try again.");
  }
}
