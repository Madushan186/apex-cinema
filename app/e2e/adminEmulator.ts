import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getIsolatedEmulatorConfig } from "./isolatedEmulatorConfig";

/**
 * Direct Firestore Admin access for Playwright test SETUP only — never
 * exercised by the app itself, and never used to assert anything (assertions
 * always go through the real UI). Exists for exactly one purpose: writing a
 * "legacy unpaid manual booking" fixture — a booking shaped the way every
 * manual booking looked BEFORE docs/DECISIONS.md D17 (confirmed,
 * paymentStatus "unpaid", no amountPaidMinor field at all).
 *
 * Since D17, `createManualBooking` always records the LKR 1,000 advance, so
 * the real UI/API can no longer produce a cancellable booking at all — every
 * booking a staff member creates through the app immediately has a recorded
 * payment, which blocks cancellation by design. Testing "cancellation of an
 * existing unpaid booking still works" (D17's own explicit requirement)
 * therefore needs a booking that predates D17, which only a direct write can
 * produce. Mirrors the exact synthetic-fixture pattern already used in
 * functions/tests/cancelManualBooking.emulator.test.ts.
 *
 * Validated against the SAME isolated-instance config every other direct
 * (non-UI) helper in this directory uses (isolatedEmulatorConfig.ts) — never
 * falls back to the live preview's project. Requires
 * FIRESTORE_EMULATOR_HOST/GCLOUD_PROJECT already set in this process's
 * environment — exported by scripts/test-e2e-emulator-isolated.sh before it
 * runs Playwright, the same way it exports them for its own Admin SDK seed
 * step.
 */
function ensureAdminApp(): void {
  const { projectId } = getIsolatedEmulatorConfig();
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      "FIRESTORE_EMULATOR_HOST is not set in this test process's environment — required for direct Admin SDK " +
        "writes; run via scripts/test-e2e-emulator-isolated.sh, which exports it before invoking Playwright.",
    );
  }
  if (process.env.GCLOUD_PROJECT !== projectId) {
    throw new Error(
      `GCLOUD_PROJECT ("${process.env.GCLOUD_PROJECT}") does not match TEST_PROJECT_ID ("${projectId}") — ` +
        "refusing to initialize the Admin SDK against a possibly-wrong project.",
    );
  }
  if (getApps().length === 0) initializeApp();
}

type LegacyPackageId = "ac-small" | "ac-large" | "non-ac";

const LEGACY_PACKAGE_FACTS: Record<LegacyPackageId, { roomId: string; totalAmountMinor: number }> = {
  "ac-small": { roomId: "room-4", totalAmountMinor: 320000 },
  "ac-large": { roomId: "room-5", totalAmountMinor: 450000 },
  "non-ac": { roomId: "room-1", totalAmountMinor: 230000 },
};

export interface LegacyUnpaidBookingFixture {
  readonly bookingId: string;
  readonly roomId: string;
  readonly referenceCode: string;
}

export async function writeLegacyUnpaidBooking(opts: {
  packageId: LegacyPackageId;
  dateISO: string;
  time: string;
  name: string;
  phone: string;
  peopleCount?: number;
}): Promise<LegacyUnpaidBookingFixture> {
  ensureAdminApp();
  const db = getFirestore();
  const facts = LEGACY_PACKAGE_FACTS[opts.packageId];
  const [hh, mm] = opts.time.split(":").map(Number);
  const startMinute = (hh ?? 0) * 60 + (mm ?? 0);
  const endMinute = startMinute + 180;

  const bookingRef = db.collection("bookings").doc();
  const referenceCode = `APX-E2ELEGACY${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  await bookingRef.set({
    packageId: opts.packageId,
    roomId: facts.roomId,
    dateISO: opts.dateISO,
    startMinute,
    endMinute,
    bookingStatus: "confirmed",
    paymentStatus: "unpaid",
    totalAmountMinor: facts.totalAmountMinor,
    currency: "LKR",
    peopleCount: opts.peopleCount ?? 2,
    customerName: opts.name,
    customerPhone: opts.phone,
    customerEmail: "",
    referenceCode,
    source: "staff_walkin",
    createdBy: "e2e-legacy-fixture-setup",
    staffNote: "",
    idempotencyKey: `e2e-legacy-${Math.random().toString(36).slice(2)}`,
    createdAt: new Date(),
  });

  const inventoryRef = db.collection("inventory").doc(`${facts.roomId}_${opts.dateISO}`);
  const existingIntervals = ((await inventoryRef.get()).data()?.intervals ?? []) as unknown[];
  await inventoryRef.set({
    roomId: facts.roomId,
    dateISO: opts.dateISO,
    intervals: [
      ...existingIntervals,
      { bookingId: bookingRef.id, startMinute, endMinute, status: "confirmed", holdExpiresAtMillis: null },
    ],
  });

  return { bookingId: bookingRef.id, roomId: facts.roomId, referenceCode };
}
