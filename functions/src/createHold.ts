import { onCall } from "firebase-functions/v2/https";
import { getHoldDurationMinutes } from "./lib/config";
import type { CreateHoldResult } from "./lib/inventory";
import { createHoldTransactional } from "./lib/inventory";
import { enforceHoldRateLimit } from "./lib/rateLimit";
import { validateHoldRequest } from "./lib/validation";

/**
 * Public, unauthenticated (guest checkout). Creates a temporary, atomically
 * reserved room hold — see lib/inventory.ts for the transaction that
 * prevents concurrent double-booking. Does NOT confirm a booking or take a
 * payment: live payments are explicitly out of scope for this phase (see
 * docs/PROGRESS.md). The response is only ever a hold, never a confirmed
 * booking.
 */
export const createHold = onCall(async (request): Promise<CreateHoldResult> => {
  const validated = validateHoldRequest(request.data);
  // Rate-limit on the (normalized) email — cheap abuse deterrent against a
  // runaway/malicious client creating many holds; see lib/rateLimit.ts.
  await enforceHoldRateLimit(validated.email);
  const holdDurationMinutes = await getHoldDurationMinutes();
  return createHoldTransactional(validated, holdDurationMinutes);
});
