/**
 * Shared booking/payment domain types — see docs/ARCHITECTURE.md section 4.
 *
 * These are data shapes only, used by BOTH the frontend (fixture and real
 * adapters) and Cloud Functions, so a real backend response is guaranteed to
 * match what the frontend already expects from the fixture adapters.
 */

/** See docs/ARCHITECTURE.md §4 "Booking status" state diagram. */
export type BookingStatus =
  | "pending_hold"
  | "expired"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "no_show";

/**
 * See docs/ARCHITECTURE.md §4 "Payment status" state diagram.
 * "unpaid" (docs/DECISIONS.md D14) is a manual-reservation-only state: no
 * online payment attempt has happened at all (distinct from every other
 * value here, which all imply an online PayHere attempt was made). It is
 * fixed at booking creation and cannot be edited this phase — recording an
 * actual payment is out of scope until a payment-confirmation function exists.
 */
export type PaymentStatus =
  | "unpaid"
  | "initiated"
  | "pending"
  | "succeeded"
  | "failed"
  | "cancelled_by_customer"
  | "refunded";

/**
 * A half-open time interval in epoch milliseconds: [startMs, endMs).
 * Using plain numbers (not Date) keeps this package dependency-free and
 * trivially serializable across the Firestore/Functions/browser boundary.
 */
export interface TimeInterval {
  readonly startMs: number;
  readonly endMs: number;
}

export type PackageId = "non-ac" | "ac-small" | "ac-large" | "party";

/** Packages a customer can pick in the online wizard (excludes "party" — see docs/PROJECT_BRIEF.md). */
export type BookablePackageId = Exclude<PackageId, "party">;

/**
 * "streaming-4k" (YouTube/Netflix on the 4K projector) is confirmed only for
 * the three bookable packages (docs/PROJECT_BRIEF.md). Party's brief confirms
 * a 4K projector but not the streaming-service claim — use "projector-4k" for
 * Party so the copy never implies an unconfirmed feature.
 */
export type FeatureId =
  | "ps4"
  | "streaming-4k"
  | "projector-4k"
  | "ac"
  | "non-ac"
  | "balloon-decor"
  | "karaoke"
  | "jbl-party-box";

export interface PackageDefinition {
  readonly id: PackageId;
  readonly priceLKR: number;
  /** null = not confirmed (see docs/DECISIONS.md #2) — never invent a value. */
  readonly sessionMinutes: number | null;
  readonly maxPeople: number;
  /** How many physical rooms back this tier (3 for non-ac, 1 otherwise). */
  readonly roomCount: number;
  /**
   * Internal room identifier(s), e.g. "Rooms 1–3" or "Room 4" — kept in the
   * data model for a future staff-facing view, but deliberately never shown
   * on public/customer-facing package presentation (the customer never picks
   * or needs to know a room number; see docs/PROJECT_BRIEF.md).
   */
  readonly roomLabel: string;
  /** false only for "party" — contact-only, excluded from public self-booking. */
  readonly isBookableOnline: boolean;
  readonly featureIds: readonly FeatureId[];
  /** The physical room ids backing this tier, e.g. ["room-1","room-2","room-3"]. */
  readonly roomIds: readonly string[];
}

export const SLOT_TIMES = ["09:00", "12:00", "15:00", "18:00"] as const;
export type SlotTime = (typeof SLOT_TIMES)[number];

export type SlotStatus = "available" | "limited" | "full" | "past";

export interface SlotAvailability {
  readonly time: SlotTime;
  readonly status: SlotStatus;
  readonly roomsFree: number;
  readonly roomsTotal: number;
}

export interface AvailabilityResult {
  readonly dateISO: string;
  readonly packageId: BookablePackageId;
  readonly slots: readonly SlotAvailability[];
}
