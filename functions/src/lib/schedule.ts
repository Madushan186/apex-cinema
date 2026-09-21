import type { PackageId, PaymentStatus } from "@apex-cinema/booking-core";
import { currentBookingTotalMinor } from "@apex-cinema/booking-core";
import { COLLECTIONS, db } from "./firestore";

/**
 * Bounded read — a single business date can only ever hold a handful of
 * bookings (6 rooms × 4 public slots, plus the rare staff-entered one), but
 * this is still an explicit defensive limit, never an unbounded query.
 */
const MAX_BOOKINGS_PER_DAY = 200;

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
  /**
   * Present only on manual reservations this phase (online holds/bookings
   * don't write this field yet — see docs/DECISIONS.md D14). Shown as-is,
   * never inferred: absence means "not tracked," not "paid."
   */
  readonly paymentStatus: PaymentStatus | null;
  /**
   * "staff_walkin" | "staff_phone" | "online" | null (online holds don't
   * write this field). Exposed so the staff UI can decide, cosmetically,
   * which rows to offer a cancel action on — the actual eligibility check
   * is always re-done server-side in cancelManualBookingTransactional
   * (docs/SECURITY.md §3: "UI hiding of buttons is cosmetic only").
   */
  readonly source: string | null;
  /** Staff-authored reason, present only once cancelled. Never customer PII — same treatment as `staffNote`. */
  readonly cancellationReason: string | null;
  /** Original package price, minor units — never changed by an extension (docs/DECISIONS.md D16). Present only on manual reservations, same as paymentStatus. */
  readonly totalAmountMinor: number | null;
  /** Number of approved +1 hour extensions so far — 0 if none. */
  readonly extensionCount: number;
  /** Sum of all extension fees, minor units — 0 if none. */
  readonly extensionChargesMinor: number;
  /** Running total actually paid (cash advance + any later recorded payment), minor units. 0 on a booking with no payment recorded — never null once totalAmountMinor is present (docs/DECISIONS.md D17). */
  readonly amountPaidMinor: number;
  /** (totalAmountMinor + extensionChargesMinor) - amountPaidMinor, computed — null only when totalAmountMinor itself is null (an online hold/booking, which has no manual-booking payment ledger this phase). */
  readonly balanceDueMinor: number | null;
}

interface RawBooking {
  packageId: PackageId;
  roomId: string;
  dateISO: string;
  startMinute: number;
  endMinute: number;
  bookingStatus: string;
  holdExpiresAt?: FirebaseFirestore.Timestamp;
  peopleCount: number;
  customerName: string;
  customerPhone: string;
  referenceCode: string;
  paymentStatus?: PaymentStatus;
  source?: string;
  cancellationReason?: string;
  totalAmountMinor?: number;
  extensionCount?: number;
  extensionChargesMinor?: number;
  amountPaidMinor?: number;
}

/**
 * A hold never displays as "confirmed" — status is *derived* here from the
 * stored `bookingStatus` plus a live expiry check against the function's
 * own clock, the same rule the createHold transaction uses (see
 * docs/ARCHITECTURE.md §6). We deliberately never rewrite the stored
 * booking doc just to display it correctly.
 */
function deriveStatus(raw: RawBooking, nowMillis: number): DisplayStatus {
  if (raw.bookingStatus === "cancelled") return "cancelled";
  if (raw.bookingStatus === "confirmed") return "confirmed";
  if (raw.bookingStatus === "pending_hold") {
    const expiresAt = raw.holdExpiresAt?.toMillis() ?? 0;
    return expiresAt > nowMillis ? "active-hold" : "expired-hold";
  }
  return "other";
}

/**
 * Only the fields staff actually need for day-to-day operations
 * (docs/PROGRESS.md "customer details needed for staff operations only") —
 * notably no email, which matters for confirmation delivery, not for
 * directing someone to their room.
 */
export async function getBookingsForDate(dateISO: string): Promise<readonly ScheduleBooking[]> {
  const snapshot = await db
    .collection(COLLECTIONS.bookings)
    .where("dateISO", "==", dateISO)
    .limit(MAX_BOOKINGS_PER_DAY)
    .get();

  const nowMillis = Date.now();
  const bookings = snapshot.docs.map((doc) => {
    const raw = doc.data() as RawBooking;
    const extensionChargesMinor = raw.extensionChargesMinor ?? 0;
    const amountPaidMinor = raw.amountPaidMinor ?? 0;
    const booking: ScheduleBooking = {
      bookingId: doc.id,
      packageId: raw.packageId,
      roomId: raw.roomId,
      startMinute: raw.startMinute,
      endMinute: raw.endMinute,
      displayStatus: deriveStatus(raw, nowMillis),
      holdExpiresAtMillis: raw.holdExpiresAt?.toMillis() ?? null,
      peopleCount: raw.peopleCount,
      customerName: raw.customerName,
      customerPhone: raw.customerPhone,
      referenceCode: raw.referenceCode,
      paymentStatus: raw.paymentStatus ?? null,
      source: raw.source ?? null,
      cancellationReason: raw.cancellationReason ?? null,
      totalAmountMinor: raw.totalAmountMinor ?? null,
      extensionCount: raw.extensionCount ?? 0,
      extensionChargesMinor,
      amountPaidMinor,
      balanceDueMinor:
        raw.totalAmountMinor === undefined
          ? null
          : currentBookingTotalMinor(raw.totalAmountMinor, extensionChargesMinor) - amountPaidMinor,
    };
    return booking;
  });

  // Sorted in memory (not via Firestore orderBy) so this never depends on a
  // composite index — the dataset is tiny by construction (see the bound above).
  return bookings.sort((a, b) => a.roomId.localeCompare(b.roomId) || a.startMinute - b.startMinute);
}

export interface ScheduleCounts {
  readonly total: number;
  readonly activeHolds: number;
  readonly expiredHolds: number;
  readonly confirmed: number;
}

export function summarizeCounts(bookings: readonly ScheduleBooking[]): ScheduleCounts {
  return {
    total: bookings.length,
    activeHolds: bookings.filter((b) => b.displayStatus === "active-hold").length,
    expiredHolds: bookings.filter((b) => b.displayStatus === "expired-hold").length,
    confirmed: bookings.filter((b) => b.displayStatus === "confirmed").length,
  };
}
