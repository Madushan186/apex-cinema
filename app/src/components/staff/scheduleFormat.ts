import type { DisplayStatus, ScheduleBooking } from "@/data/firebase/staffApi";

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

export const STATUS_BADGE_VARIANT: Record<DisplayStatus, "warning" | "outline" | "positive" | "default"> = {
  "active-hold": "warning",
  "expired-hold": "outline",
  confirmed: "positive",
  other: "default",
};
