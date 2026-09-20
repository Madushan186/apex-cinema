import { HttpsError, onCall } from "firebase-functions/v2/https";
import { isValidDateISO } from "@apex-cinema/booking-core";
import { requireRole } from "./lib/auth";
import type { ScheduleCounts } from "./lib/schedule";
import { getBookingsForDate, summarizeCounts } from "./lib/schedule";

export interface GetOwnerOverviewRequest {
  readonly dateISO: string;
}

export interface GetOwnerOverviewResponse {
  readonly dateISO: string;
  readonly counts: ScheduleCounts;
}

/**
 * Owner only — deliberately a *separate* function from getStaffSchedule
 * (not just a role check staff also satisfies) so there is a genuine
 * owner-exclusive endpoint to enforce and test against
 * (docs/PROGRESS.md "staff cannot access owner-only endpoints").
 *
 * Counts only — booking/hold counts, never revenue, payment records, or a
 * financial report (docs/PROGRESS.md scope boundary: no invented financial
 * data. No payment has ever succeeded in this system yet — there is nothing
 * "paid" to report).
 */
export const getOwnerOverview = onCall(async (request): Promise<GetOwnerOverviewResponse> => {
  requireRole(request, ["owner"]);

  const dateISO = request.data?.dateISO;
  if (typeof dateISO !== "string" || !isValidDateISO(dateISO)) {
    throw new HttpsError("invalid-argument", "dateISO must be a valid YYYY-MM-DD date.");
  }

  const bookings = await getBookingsForDate(dateISO);
  return { dateISO, counts: summarizeCounts(bookings) };
});
