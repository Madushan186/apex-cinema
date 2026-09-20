import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import type { AvailabilityAdapter, AvailabilityResult } from "@/data/types";

interface GetAvailabilityRequest {
  readonly packageId: string;
  readonly dateISO: string;
}

const getAvailabilityCallable = httpsCallable<GetAvailabilityRequest, AvailabilityResult>(
  functions,
  "getAvailability",
);

/** Real adapter: calls the `getAvailability` Cloud Function — see docs/PROGRESS.md. */
export function createFirebaseAvailabilityAdapter(): AvailabilityAdapter {
  return {
    async getAvailability({ packageId, dateISO }) {
      // `simulateError` is a fixture-only concept — the real backend has real
      // errors instead, nothing to simulate here.
      const result = await getAvailabilityCallable({ packageId, dateISO });
      return result.data;
    },
  };
}
