import { HttpsError, onCall } from "firebase-functions/v2/https";
import { isValidDateISO } from "@apex-cinema/booking-core";
import { requireRole } from "./lib/auth";
import type { ScheduleBooking } from "./lib/schedule";
import { getBookingsForDate } from "./lib/schedule";

export interface GetStaffScheduleRequest {
  readonly dateISO: string;
}

export interface GetStaffScheduleResponse {
  readonly dateISO: string;
  readonly bookings: readonly ScheduleBooking[];
}

/**
 * Staff or Owner only (docs/SECURITY.md §3: "View any/all bookings" — ✅ for
 * both roles). Read-only — no mutation exists yet (docs/PROGRESS.md scope).
 */
export const getStaffSchedule = onCall(async (request): Promise<GetStaffScheduleResponse> => {
  requireRole(request, ["staff", "owner"]);

  const dateISO = request.data?.dateISO;
  if (typeof dateISO !== "string" || !isValidDateISO(dateISO)) {
    throw new HttpsError("invalid-argument", "dateISO must be a valid YYYY-MM-DD date.");
  }

  const bookings = await getBookingsForDate(dateISO);
  return { dateISO, bookings };
});
