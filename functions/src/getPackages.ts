import { onCall } from "firebase-functions/v2/https";
import type { PackageDefinition } from "@apex-cinema/booking-core";
import { COLLECTIONS, db } from "./lib/firestore";

export interface GetPackagesResponse {
  readonly packages: readonly PackageDefinition[];
}

/**
 * Public, unauthenticated (guest checkout — no registration/login required).
 * Reads the `roomTiers` collection (populated by scripts/seed-emulator.ts
 * from the canonical @apex-cinema/booking-core catalog) rather than
 * returning the in-memory catalog directly, so this genuinely reflects what
 * the emulator has seeded — including Party (isBookableOnline: false),
 * matching the shape the frontend's fixture adapter already returns.
 */
export const getPackages = onCall(async (): Promise<GetPackagesResponse> => {
  const snapshot = await db.collection(COLLECTIONS.roomTiers).get();
  const packages = snapshot.docs.map((doc) => doc.data() as PackageDefinition);
  return { packages };
});
