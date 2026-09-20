import { createHash, randomBytes } from "node:crypto";

/** Random, non-guessable customer-facing booking reference — see docs/ARCHITECTURE.md §7. */
export function generateReferenceCode(): string {
  const raw = randomBytes(6).toString("hex").toUpperCase(); // 12 hex chars, ~48 bits of entropy
  return `APX-${raw}`;
}

/**
 * Deterministic fingerprint of the meaningful request fields, used to detect
 * idempotency-key reuse with a *different* request (which must be rejected,
 * not silently served from the wrong cached response).
 */
export function fingerprintHoldRequest(input: {
  packageId: string;
  dateISO: string;
  time: string;
  peopleCount: number;
  email: string;
}): string {
  const canonical = [input.packageId, input.dateISO, input.time, input.peopleCount, input.email].join("|");
  return createHash("sha256").update(canonical).digest("hex");
}
