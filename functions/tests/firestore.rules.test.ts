/**
 * Firestore Security Rules test against the real Firestore emulator — see
 * the file-level note in ping.emulator.test.ts, same applies here: only
 * meaningful under `firebase emulators:exec` (the root `test:emulators`
 * script).
 *
 * Covers the default-deny posture required by docs/SECURITY.md §1: the
 * narrow public reads are allowed, and everything else (in particular any
 * client write, and any read of unlisted collections such as `bookings`)
 * is denied.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  type RulesTestEnvironment,
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, describe, it } from "vitest";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-apex-cinema-rules-test",
    firestore: {
      rules: readFileSync(resolve(import.meta.dirname, "../../firestore.rules"), "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe("firestore.rules", () => {
  it("allows an unauthenticated client to read public room tiers", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(db.collection("roomTiers").doc("room-1").get());
  });

  it("allows an unauthenticated client to read the public booking config", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(db.collection("config").doc("booking").get());
  });

  it("denies any client write to room tiers, even authenticated", async () => {
    const db = testEnv.authenticatedContext("some-uid").firestore();
    await assertFails(db.collection("roomTiers").doc("room-1").set({ priceLKR: 1 }));
  });

  it("denies any client read of bookings (PII/financial data)", async () => {
    const db = testEnv.authenticatedContext("some-uid").firestore();
    await assertFails(db.collection("bookings").doc("some-booking").get());
  });

  it("denies any client write to bookings", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.collection("bookings").doc("some-booking").set({ bookingStatus: "confirmed" }));
  });

  it("denies a client trying to mark its own booking's payment as successful", async () => {
    const db = testEnv.authenticatedContext("some-uid").firestore();
    // Even a targeted field update (not a full overwrite) must be denied —
    // this is the exact "browser client marks payment successful" attack
    // the booking engine must be immune to.
    await assertFails(
      db.collection("bookings").doc("some-booking").update({ bookingStatus: "confirmed", paymentStatus: "succeeded" }),
    );
  });

  it("denies any client read or write of the inventory locks", async () => {
    const db = testEnv.authenticatedContext("some-uid").firestore();
    await assertFails(db.collection("inventory").doc("room-4_2026-01-01").get());
    await assertFails(
      db.collection("inventory").doc("room-4_2026-01-01").set({ roomId: "room-4", dateISO: "2026-01-01", intervals: [] }),
    );
  });

  it("denies any client read or write of the hold-idempotency records", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.collection("holdIdempotency").doc("some-key").get());
    await assertFails(db.collection("holdIdempotency").doc("some-key").set({ fingerprint: "x" }));
  });

  it("denies any client read or write of the rate-limit counters", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.collection("rateLimits").doc("hold_abc").get());
    await assertFails(db.collection("rateLimits").doc("hold_abc").set({ count: 0 }));
  });

  it("denies any client read or write of physical room documents", async () => {
    const db = testEnv.authenticatedContext("some-uid").firestore();
    await assertFails(db.collection("rooms").doc("room-1").get());
    await assertFails(db.collection("rooms").doc("room-1").set({ active: false }));
  });

  // Staff/Owner dashboards read exclusively through getStaffSchedule /
  // getOwnerOverview (Cloud Functions using the Admin SDK, which bypasses
  // these rules entirely) — never directly from the client. These prove
  // that stays true even for a token carrying the real role claim: nothing
  // about having "staff"/"owner" on the token grants any client-side
  // Firestore access (defense-in-depth, docs/PROGRESS.md this phase).
  it("denies a staff-claimed client from directly reading bookings or inventory", async () => {
    const db = testEnv.authenticatedContext("staff-uid", { role: "staff" }).firestore();
    await assertFails(db.collection("bookings").doc("some-booking").get());
    await assertFails(db.collection("inventory").doc("room-4_2026-01-01").get());
  });

  it("denies an owner-claimed client from directly reading or writing bookings or inventory", async () => {
    const db = testEnv.authenticatedContext("owner-uid", { role: "owner" }).firestore();
    await assertFails(db.collection("bookings").doc("some-booking").get());
    await assertFails(db.collection("bookings").doc("some-booking").set({ bookingStatus: "confirmed" }));
    await assertFails(db.collection("inventory").doc("room-4_2026-01-01").get());
    await assertFails(
      db.collection("inventory").doc("room-4_2026-01-01").set({ roomId: "room-4", dateISO: "2026-01-01", intervals: [] }),
    );
  });
});
