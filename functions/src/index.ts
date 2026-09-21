import { intervalsOverlap } from "@apex-cinema/booking-core";
import { onCall } from "firebase-functions/v2/https";

// NOTE: no `region()` set — this is a foundation-phase placeholder, not a
// deployment decision. Function region (e.g. closer to Sri Lanka) is a
// later, explicit decision — see docs/DECISIONS.md.

export { cancelManualBooking } from "./cancelManualBooking";
export { createHold } from "./createHold";
export { createManualBooking } from "./createManualBooking";
export { extendManualBooking } from "./extendManualBooking";
export { getAvailability } from "./getAvailability";
export { getOwnerOverview } from "./getOwnerOverview";
export { getPackages } from "./getPackages";
export { getStaffSchedule } from "./getStaffSchedule";
export { recordManualBookingPayment } from "./recordManualBookingPayment";

export interface PingResponse {
  ok: true;
  bookingCoreLinked: boolean;
  serverTime: string;
}

/** Pure handler logic, unit-testable without spinning up any emulator. */
export function buildPingResponse(): PingResponse {
  const bookingCoreLinked = intervalsOverlap({ startMs: 0, endMs: 1 }, { startMs: 0, endMs: 1 });
  return {
    ok: true,
    bookingCoreLinked,
    serverTime: new Date().toISOString(),
  };
}

/**
 * Foundation smoke-test function only. Proves the Cloud Functions
 * build/emulator pipeline and the packages/booking-core workspace boundary
 * resolve end-to-end. Not part of the booking domain — replace/remove once
 * real booking functions land (see docs/PROGRESS.md next-phase list).
 */
export const ping = onCall(() => buildPingResponse());
