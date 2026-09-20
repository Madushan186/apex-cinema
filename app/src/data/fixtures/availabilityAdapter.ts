import { getColomboMinuteOfDay, isColomboToday, slotTimeToMinutes } from "@/lib/colomboTime";
import type { AvailabilityAdapter, AvailabilityResult, SlotAvailability, SlotStatus } from "@/data/types";
import { SLOT_TIMES } from "@/data/types";
import { PACKAGE_FIXTURES } from "./packages";

const FIXTURE_LATENCY_MS = 350;

/** Small deterministic string hash — same (date, package, time) always produces the same demo result. */
function hashToInt(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function statusFor(roomsFree: number, roomsTotal: number): SlotStatus {
  if (roomsFree <= 0) return "full";
  if (roomsFree >= roomsTotal) return "available";
  return "limited";
}

export function createFixtureAvailabilityAdapter(): AvailabilityAdapter {
  return {
    getAvailability({ packageId, dateISO, simulateError }): Promise<AvailabilityResult> {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          if (simulateError) {
            reject(new Error("Simulated availability lookup failure (fixture demo)."));
            return;
          }

          const pkg = PACKAGE_FIXTURES.find((p) => p.id === packageId);
          const roomsTotal = pkg?.roomCount ?? 1;
          const today = isColomboToday(dateISO);
          const nowMinutes = getColomboMinuteOfDay();

          const slots: SlotAvailability[] = SLOT_TIMES.map((time) => {
            if (today && slotTimeToMinutes(time) <= nowMinutes) {
              return { time, status: "past", roomsFree: 0, roomsTotal };
            }
            const seed = hashToInt(`${dateISO}|${packageId}|${time}`);
            const roomsFree = seed % (roomsTotal + 1);
            return { time, status: statusFor(roomsFree, roomsTotal), roomsFree, roomsTotal };
          });

          resolve({ dateISO, packageId, slots });
        }, FIXTURE_LATENCY_MS);
      });
    },
  };
}
