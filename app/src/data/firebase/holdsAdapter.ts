import { FirebaseError } from "firebase/app";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import type { CreateHoldInput, HoldErrorReason, HoldResult, HoldsAdapter } from "@/data/types";
import { HoldError } from "@/data/types";

const createHoldCallable = httpsCallable<CreateHoldInput, HoldResult>(functions, "createHold");

function mapErrorCode(code: string): HoldErrorReason {
  switch (code) {
    case "functions/failed-precondition":
      return "unavailable";
    case "functions/invalid-argument":
      return "invalid-request";
    case "functions/already-exists":
      return "idempotency-conflict";
    case "functions/resource-exhausted":
      return "rate-limited";
    default:
      return "unknown";
  }
}

/** Real adapter: calls the `createHold` Cloud Function — see docs/PROGRESS.md. Never confirms a booking or takes payment. */
export function createFirebaseHoldsAdapter(): HoldsAdapter {
  return {
    async createHold(input: CreateHoldInput): Promise<HoldResult> {
      try {
        const result = await createHoldCallable(input);
        return result.data;
      } catch (error) {
        if (error instanceof FirebaseError) {
          throw new HoldError(mapErrorCode(error.code), error.message);
        }
        throw new HoldError("unknown", "Something went wrong creating your hold. Please try again.");
      }
    },
  };
}
