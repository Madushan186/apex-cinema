import type { PackageId, PaymentStatus } from "@apex-cinema/booking-core";
import { COLLECTIONS, db } from "./firestore";

/**
 * Bounded read — a single business date can only ever hold a handful of
 * bookings (6 rooms × 4 public slots, plus the rare staff-entered one), but
 * this is still an explicit defensive limit, never an unbounded query.
 */
const MAX_BOOKINGS_PER_DAY = 200;

export type DisplayStatus = "active-hold" | "expired-hold" | "confirmed" | "other";

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
}

/**
 * A hold never displays as "confirmed" — status is *derived* here from the
 * stored `bookingStatus` plus a live expiry check against the function's
 * own clock, the same rule the createHold transaction uses (see
 * docs/ARCHITECTURE.md §6). We deliberately never rewrite the stored
 * booking doc just to display it correctly.
 */
function deriveStatus(raw: RawBooking, nowMillis: number): DisplayStatus {
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
