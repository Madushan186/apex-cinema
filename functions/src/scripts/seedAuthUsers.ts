/**
 * Repeatable, emulator-only setup for exactly one Owner and one Staff test
 * account. Safe to re-run — looks up each account by email first and
 * updates it in place rather than erroring on a duplicate.
 *
 * Run via `npm run seed:auth` (root) — never directly against a real
 * project. See the guard below: this refuses to run unless it can
 * positively confirm it's talking to the local Auth emulator.
 *
 * These are DEVELOPMENT-ONLY credentials for the local emulator. They are
 * not real accounts, not sent anywhere, and grant no access outside your
 * own machine's emulator. Never reuse these values for anything real.
 */
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const TEST_ACCOUNTS = [
  {
    role: "owner" as const,
    email: "owner@apexcinema.test",
    password: "LocalOwner!123",
    displayName: "Test Owner (local emulator only)",
  },
  {
    role: "staff" as const,
    email: "staff@apexcinema.test",
    password: "LocalStaff!123",
    displayName: "Test Staff (local emulator only)",
  },
];

function assertEmulatorTarget(): void {
  const authEmulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (!authEmulatorHost) {
    throw new Error(
      "Refusing to seed: FIREBASE_AUTH_EMULATOR_HOST is not set. This script only ever seeds the local " +
        "Firebase Auth emulator — run it via `npm run seed:auth`, never directly against a real project.",
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
  const auth = getAuth();

  for (const account of TEST_ACCOUNTS) {
    let uid: string;
    try {
      const existing = await auth.getUserByEmail(account.email);
      uid = existing.uid;
      await auth.updateUser(uid, { password: account.password, displayName: account.displayName });
    } catch {
      const created = await auth.createUser({
        email: account.email,
        password: account.password,
        displayName: account.displayName,
        emailVerified: true,
      });
      uid = created.uid;
    }

    // The ONLY place a role is ever granted — see functions/src/lib/auth.ts.
    // Never exposed as a callable function; this script is run manually,
    // locally, against the emulator only.
    await auth.setCustomUserClaims(uid, { role: account.role });

    console.log(`Seeded ${account.role} test account: ${account.email} (uid: ${uid})`);
  }

  console.log("\nLocal emulator test credentials (development-only, never real):");
  for (const account of TEST_ACCOUNTS) {
    console.log(`  ${account.role.padEnd(6)} ${account.email}  /  ${account.password}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
