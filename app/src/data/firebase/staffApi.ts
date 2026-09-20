import type { PackageId } from "@apex-cinema/booking-core";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";

export type DisplayStatus = "active-hold" | "expired-hold" | "confirmed" | "other";

export interface ScheduleBooking {
  readonly bookingId: string;
  readonly packageId: PackageId;
  readonly roomId: string;
  readonly startMinute: number;
  readonly endMinute: number;
  readonly displayStatus: DisplayStatus;
  readonly holdExpiresAtMillis: number | null;
  readonly peopleCount: number;
  readonly customerName: string;
  readonly customerPhone: string;
  readonly referenceCode: string;
}

export interface ScheduleCounts {
  readonly total: number;
  readonly activeHolds: number;
  readonly expiredHolds: number;
  readonly confirmed: number;
}

const getStaffScheduleCallable = httpsCallable<
  { dateISO: string },
  { dateISO: string; bookings: readonly ScheduleBooking[] }
>(functions, "getStaffSchedule");

const getOwnerOverviewCallable = httpsCallable<
  { dateISO: string },
  { dateISO: string; counts: ScheduleCounts }
>(functions, "getOwnerOverview");

/** Staff or Owner — see functions/src/getStaffSchedule.ts. Rejects (permission-denied/unauthenticated) if the caller isn't signed in with an approved role. */
export async function getStaffSchedule(dateISO: string): Promise<readonly ScheduleBooking[]> {
  const result = await getStaffScheduleCallable({ dateISO });
  return result.data.bookings;
}

/** Owner only — see functions/src/getOwnerOverview.ts. */
export async function getOwnerOverview(dateISO: string): Promise<ScheduleCounts> {
  const result = await getOwnerOverviewCallable({ dateISO });
  return result.data.counts;
}
