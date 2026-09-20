/**
 * Deterministic date/slot selection for browser tests — NOT a test file
 * itself (no `test`/`describe` here, so Playwright's test runner ignores
 * it).
 *
 * Root cause this fixes (see docs/PROGRESS.md): the booking-wizard browser
 * tests used to click "Today" and grab the first slot labelled "available".
 * Business hours are 09:00-21:00 Colombo time with exactly 4 daily start
 * times (09:00/12:00/15:00/18:00); a slot is client-side-excluded as "past"
 * once its start time has gone by *today*. Run those tests late enough in
 * the Colombo business day (or after closing) and zero slots for "today"
 * remain clickable — a real, reproducible failure, not test flakiness.
 *
 * Fix: never rely on "today" or the wall-clock time of day at all. Pick a
 * date a few days out (computed via the same `addDaysToColomboToday` the
 * app itself uses, so it's always correct across month/year boundaries and
 * never goes stale), and select an exact, deterministically-known-bookable
 * time slot instead of searching for whatever happens to render as
 * "available" at test-run time.
 */
import { addDaysToColomboToday } from "@apex-cinema/booking-core";

export const SLOT_TIMES = ["09:00", "12:00", "15:00", "18:00"] as const;

/** Exact re-implementation of app/src/data/fixtures/availabilityAdapter.ts's hash — must stay in sync with it. */
function hashToInt(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function fixtureRoomsFree(dateISO: string, packageId: string, time: string, roomsTotal: number): number {
  const seed = hashToInt(`${dateISO}|${packageId}|${time}`);
  return seed % (roomsTotal + 1);
}

/**
 * A (dateISO, time) pair for the FIXTURE adapter that is guaranteed, by
 * replicating its deterministic hash, to render as a bookable slot —
 * regardless of what day or time the test suite happens to run. Never
 * "today" (offset starts at `startOffsetDays >= 1`), so the "past slot"
 * exclusion can never apply to it.
 */
export function findDeterministicFixtureSlot(
  packageId: string,
  roomsTotal: number,
  startOffsetDays = 5,
  searchDays = 25,
): { dateISO: string; time: string } {
  for (let offset = startOffsetDays; offset < startOffsetDays + searchDays; offset++) {
    const dateISO = addDaysToColomboToday(offset);
    for (const time of SLOT_TIMES) {
      if (fixtureRoomsFree(dateISO, packageId, time, roomsTotal) > 0) {
        return { dateISO, time };
      }
    }
  }
  throw new Error(`No deterministically-bookable fixture slot found for "${packageId}" within the searched range.`);
}

/**
 * A future (never "today") business date for the REAL emulator test. A
 * freshly seeded/empty emulator run has zero existing bookings for any
 * future date, so every slot on it is genuinely available — no hash
 * needed, just "not today" (so time-of-day can never matter) and inside
 * the booking window.
 */
export function futureBusinessDate(offsetDays = 5): string {
  return addDaysToColomboToday(offsetDays);
}
