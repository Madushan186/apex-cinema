/**
 * Repeatable, emulator-only seed script for rooms/packages/config. Safe to
 * re-run any time — every write is a deterministic `.set()` keyed by a
 * stable doc id, so re-seeding just overwrites with the same canonical data
 * rather than duplicating anything.
 *
 * Run via `npm run seed:emulator` (root) — never directly against a real
 * project. See the guard below: this refuses to run unless it can positively
 * confirm it's talking to the local Firestore emulator.
 */
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  CLOSE_MINUTE,
  DEFAULT_HOLD_DURATION_MINUTES,
  OPEN_MINUTE,
  PACKAGE_CATALOG,
  SESSION_MINUTES,
  SLOT_TIMES,
} from "@apex-cinema/booking-core";
import { COLLECTIONS } from "../lib/firestore";

function assertEmulatorTarget(): void {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  if (!emulatorHost) {
    throw new Error(
      "Refusing to seed: FIRESTORE_EMULATOR_HOST is not set. This script only ever seeds the local " +
        "Firestore emulator — run it via `npm run seed:emulator`, never directly against a real project.",
    );
  }

  const projectId = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT ?? "";
  if (!projectId.startsWith("demo-")) {
    throw new Error(
      `Refusing to seed: resolved project id "${projectId}" does not start with "demo-". ` +
        "This script only ever seeds a demo/offline emulator project (see .firebaserc).",
    );
  }
}

async function main(): Promise<void> {
  assertEmulatorTarget();

  if (getApps().length === 0) initializeApp();
  const db = getFirestore();
  const batch = db.batch();

  for (const pkg of PACKAGE_CATALOG) {
    batch.set(db.collection(COLLECTIONS.roomTiers).doc(pkg.id), pkg);
    for (const roomId of pkg.roomIds) {
      const roomNumber = Number(roomId.split("-")[1]);
      batch.set(db.collection(COLLECTIONS.rooms).doc(roomId), {
        roomId,
        tierId: pkg.id,
        roomNumber,
        active: true,
      });
    }
  }

  batch.set(db.collection(COLLECTIONS.config).doc("booking"), {
    openMinute: OPEN_MINUTE,
    closeMinute: CLOSE_MINUTE,
    publicStartTimes: SLOT_TIMES,
    sessionMinutes: SESSION_MINUTES,
    holdDurationMinutes: DEFAULT_HOLD_DURATION_MINUTES,
  });

  await batch.commit();

  const roomCount = PACKAGE_CATALOG.reduce((sum, pkg) => sum + pkg.roomIds.length, 0);
  console.log(
    `Seeded ${PACKAGE_CATALOG.length} package tiers, ${roomCount} rooms, and config/booking into ` +
      `project "${process.env.GCLOUD_PROJECT}" (emulator: ${process.env.FIRESTORE_EMULATOR_HOST}).`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
