import type { AvailabilityResult, BookablePackageId, SlotAvailability, SlotStatus } from "@apex-cinema/booking-core";
import {
  SLOT_TIMES,
  computeEndMinute,
  getColomboMinuteOfDay,
  getColomboTodayISO,
  getPackageFacts,
  slotTimeToMinutes,
} from "@apex-cinema/booking-core";
import { COLLECTIONS, db, inventoryDocId } from "./firestore";
import type { InventoryDoc } from "./inventory";
import { isActive, minutesOverlap } from "./inventory";

function statusFor(roomsFree: number, roomsTotal: number): SlotStatus {
  if (roomsFree <= 0) return "full";
  if (roomsFree >= roomsTotal) return "available";
  return "limited";
}

/**
 * Plain (non-transactional) read — safe because availability is advisory
 * information, not a reservation. The actual guarantee against
 * double-booking happens in the createHold transaction (lib/inventory.ts),
 * which re-checks everything atomically regardless of what this returned.
 * Returns only aggregate free/full counts per slot — no booking IDs, no
 * customer data (docs/SECURITY.md §2: public availability must never leak PII).
 */
export async function computeAvailability(
  packageId: BookablePackageId,
  dateISO: string,
): Promise<AvailabilityResult> {
  const facts = getPackageFacts(packageId);
  if (!facts || !facts.isBookableOnline) {
    throw new Error("computeAvailability called with a non-bookable package");
  }

  const roomIds = facts.roomIds;
  const refs = roomIds.map((roomId) => db.collection(COLLECTIONS.inventory).doc(inventoryDocId(roomId, dateISO)));
  const snaps = refs.length > 0 ? await db.getAll(...refs) : [];
  const inventoryByRoom = new Map<string, InventoryDoc | undefined>(
    roomIds.map((roomId, i) => [roomId, snaps[i]?.data() as InventoryDoc | undefined]),
  );

  const nowMillis = Date.now();
  const today = getColomboTodayISO();
  const isToday = dateISO === today;
  const nowMinute = getColomboMinuteOfDay();

  const slots: SlotAvailability[] = SLOT_TIMES.map((time) => {
    const startMinute = slotTimeToMinutes(time);
    const sessionMinutes = facts.sessionMinutes ?? 0;
    const endMinute = computeEndMinute(startMinute, sessionMinutes);

    if (isToday && startMinute <= nowMinute) {
      return { time, status: "past", roomsFree: 0, roomsTotal: roomIds.length };
    }

    const roomsFree = roomIds.reduce((count, roomId) => {
      const intervals = inventoryByRoom.get(roomId)?.intervals ?? [];
      const occupied = intervals.some(
        (interval) =>
          isActive(interval, nowMillis) && minutesOverlap({ start: startMinute, end: endMinute }, { start: interval.startMinute, end: interval.endMinute }),
      );
      return occupied ? count : count + 1;
    }, 0);

    return { time, status: statusFor(roomsFree, roomIds.length), roomsFree, roomsTotal: roomIds.length };
  });

  return { dateISO, packageId, slots };
}
