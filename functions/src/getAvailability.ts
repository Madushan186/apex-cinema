import { onCall } from "firebase-functions/v2/https";
import type { AvailabilityResult } from "@apex-cinema/booking-core";
import { computeAvailability } from "./lib/availability";
import { validateAvailabilityRequest } from "./lib/validation";

/**
 * Public, unauthenticated. Returns only aggregate free/full counts per fixed
 * public start time — never a booking id, never customer data (see
 * lib/availability.ts and docs/SECURITY.md §2).
 */
export const getAvailability = onCall(async (request): Promise<AvailabilityResult> => {
  const { packageId, dateISO } = validateAvailabilityRequest(request.data);
  return computeAvailability(packageId, dateISO);
});
