/**
 * Re-exports the shared Asia/Colombo date/time helpers from booking-core so
 * both the frontend and Cloud Functions compute "today"/"now" identically —
 * see packages/booking-core/src/time.ts for the implementation. Kept as a
 * thin wrapper (rather than updating every import site) to avoid touching
 * unrelated files in this phase.
 */
export {
  BOOKING_WINDOW_DAYS,
  addDaysToColomboToday,
  formatDateLabel,
  getColomboMinuteOfDay,
  getColomboTodayISO,
  isColomboToday,
  slotTimeToMinutes,
} from "@apex-cinema/booking-core";
