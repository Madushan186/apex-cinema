import { CLOSE_MINUTE, EXTENSION_MINUTES } from "@apex-cinema/booking-core";
import type { DisplayStatus, ScheduleBooking } from "@/data/firebase/staffApi";
import { getColomboMinuteOfDay, getColomboTodayISO } from "@/lib/colomboTime";

/** Fixed room set — see packages/booking-core/src/packageCatalog.ts (rooms 1-6 never change). */
export const ROOM_IDS = ["room-1", "room-2", "room-3", "room-4", "room-5", "room-6"] as const;

export const PARTY_ROOM_ID = "room-6";

export function roomNumber(roomId: string): string {
  return roomId.replace("room-", "");
}

/** Same UTC-noon-pivot approach as booking-core's addDaysToColomboToday, but from an arbitrary base date. */
export function addDaysToDateISO(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const pivot = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1, 12));
  pivot.setUTCDate(pivot.getUTCDate() + days);
  const yy = pivot.getUTCFullYear();
  const mm = String(pivot.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(pivot.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function formatTimeOfDay(minuteOfDay: number): string {
  const hh = String(Math.floor(minuteOfDay / 60) % 24).padStart(2, "0");
  const mm = String(minuteOfDay % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function groupByRoom(
  bookings: readonly ScheduleBooking[],
): ReadonlyMap<string, readonly ScheduleBooking[]> {
  const map = new Map<string, ScheduleBooking[]>(ROOM_IDS.map((id) => [id, []]));
  for (const booking of bookings) {
    map.get(booking.roomId)?.push(booking);
  }
  return map;
}

export const STATUS_BADGE_VARIANT: Record<DisplayStatus, "warning" | "outline" | "positive" | "negative" | "default"> = {
  "active-hold": "warning",
  "expired-hold": "outline",
  confirmed: "positive",
  cancelled: "negative",
  other: "default",
};

const MANUAL_BOOKING_SOURCES = new Set(["staff_walkin", "staff_phone"]);

/**
 * Cosmetic-only eligibility check for whether to show a Cancel action on a
 * schedule row — mirrors functions/src/lib/inventory.ts's
 * cancelManualBookingTransactional rules exactly, but this is NOT the
 * actual control: the server re-checks every one of these conditions
 * itself (docs/SECURITY.md §3: "UI hiding of buttons is cosmetic only and
 * never the actual control"). `scheduleDateISO` is the date the schedule
 * page is currently showing (every booking in a given schedule response
 * shares it — see functions/src/lib/schedule.ts).
 */
export function isCancelEligible(booking: ScheduleBooking, scheduleDateISO: string): boolean {
  if (booking.displayStatus !== "confirmed") return false;
  if (!booking.source || !MANUAL_BOOKING_SOURCES.has(booking.source)) return false;
  if (booking.paymentStatus !== "unpaid") return false;
  if (booking.roomId === PARTY_ROOM_ID) return false;

  const todayISO = getColomboTodayISO();
  const nowMinute = getColomboMinuteOfDay();
  const hasStarted = scheduleDateISO < todayISO || (scheduleDateISO === todayISO && booking.startMinute <= nowMinute);
  return !hasStarted;
}

/**
 * Cosmetic-only eligibility check for whether to show an "Extend +1 hour"
 * action — mirrors functions/src/lib/inventory.ts's
 * extendManualBookingTransactional rules exactly, but this is NOT the
 * actual control (docs/SECURITY.md §3). Unlike cancellation, the time
 * window here is the OPPOSITE: allowed before OR during the session,
 * rejected only once the booking's current end time has passed. Also
 * checked here (purely to avoid showing a button that would immediately
 * bounce off the closing-time check): the new end time must still fit
 * before 21:00.
 */
export function isExtendEligible(booking: ScheduleBooking, scheduleDateISO: string): boolean {
  if (booking.displayStatus !== "confirmed") return false;
  if (!booking.source || !MANUAL_BOOKING_SOURCES.has(booking.source)) return false;
  if (booking.paymentStatus !== "unpaid") return false;
  if (booking.roomId === PARTY_ROOM_ID) return false;
  if (booking.endMinute + EXTENSION_MINUTES > CLOSE_MINUTE) return false;

  const todayISO = getColomboTodayISO();
  const nowMinute = getColomboMinuteOfDay();
  const hasEnded = scheduleDateISO < todayISO || (scheduleDateISO === todayISO && booking.endMinute <= nowMinute);
  return !hasEnded;
}
