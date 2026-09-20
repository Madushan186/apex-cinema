import { createHash } from "node:crypto";
import { HttpsError } from "firebase-functions/v2/https";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { COLLECTIONS, db } from "./firestore";

// Fixed-window limiter: bounded document size (one small doc per key), no
// unbounded growth, no external dependency (no Redis/App Check needed for
// this local-emulator phase). Deliberately coarse — this is abuse
// protection against a runaway client, not a precise quota system.
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 8;

/**
 * Throws HttpsError("resource-exhausted", ...) if `identity` (e.g. a hashed
 * email) has made too many hold-creation attempts in the current window.
 * Never trusts client-supplied timestamps — uses the Cloud Functions
 * server clock throughout.
 */
export async function enforceHoldRateLimit(identity: string): Promise<void> {
  const key = createHash("sha256").update(identity).digest("hex");
  const ref = db.collection(COLLECTIONS.rateLimits).doc(`hold_${key}`);
  const now = Timestamp.now();

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const data = snap.data() as { count: number; windowStartMillis: number } | undefined;

    if (!data || now.toMillis() - data.windowStartMillis >= WINDOW_MS) {
      transaction.set(ref, { count: 1, windowStartMillis: now.toMillis(), updatedAt: FieldValue.serverTimestamp() });
      return;
    }

    if (data.count >= MAX_REQUESTS_PER_WINDOW) {
      throw new HttpsError("resource-exhausted", "Too many booking attempts — please wait a moment and try again.");
    }

    transaction.update(ref, { count: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
  });
}
