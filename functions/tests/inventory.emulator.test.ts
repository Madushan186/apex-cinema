/**
 * Integration tests against the real Firestore + Functions emulators — see
 * the file-level note in ping.emulator.test.ts: only meaningful under
 * `firebase emulators:exec` (the root `test:emulators` script, which also
 * seeds the catalog via `npm run seed:emulator --workspace functions`
 * before this file runs).
 *
 * Covers every scenario explicitly required for this phase — concurrency,
 * idempotency, expiry, validation, adjacency, partial-interval blocking,
 * transactional atomicity on failure, PII-free public responses, and that
 * this whole run never touches anything but the local demo emulator.
 */
import { initializeApp } from "firebase/app";
import { connectFunctionsEmulator, getFunctions, httpsCallable, type FunctionsError } from "firebase/functions";
import type { AvailabilityResult } from "@apex-cinema/booking-core";
import { addDaysToColomboToday } from "@apex-cinema/booking-core";
import { getApps, initializeApp as initAdminApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { beforeAll, describe, expect, it } from "vitest";
import type { CreateHoldResult } from "../src/lib/inventory";
import { COLLECTIONS, inventoryDocId } from "../src/lib/firestore";

interface CreateHoldRequest {
  packageId: string;
  dateISO: string;
  time: string;
  peopleCount: number;
  name: string;
  phone: string;
  email: string;
  idempotencyKey: string;
  // Deliberately allowed to smuggle extra fields in tests, to prove the
  // server ignores anything it doesn't expect (see "tampered amount" test).
  [extra: string]: unknown;
}

let createHold: ReturnType<typeof httpsCallable<CreateHoldRequest, CreateHoldResult>>;
let getAvailability: ReturnType<typeof httpsCallable<{ packageId: string; dateISO: string }, AvailabilityResult>>;
let getPackages: ReturnType<typeof httpsCallable<Record<string, never>, { packages: unknown[] }>>;

beforeAll(() => {
  const app = initializeApp({ projectId: "demo-apex-cinema" }, "inventory-emulator-test");
  const functions = getFunctions(app);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  createHold = httpsCallable(functions, "createHold");
  getAvailability = httpsCallable(functions, "getAvailability");
  getPackages = httpsCallable(functions, "getPackages");

  if (getApps().length === 0) initAdminApp();
});

function uniqueKey(label: string): string {
  return `test-${label}-${Math.random().toString(36).slice(2)}`;
}

function guest(email: string, overrides: Partial<CreateHoldRequest> = {}): CreateHoldRequest {
  return {
    packageId: "ac-small",
    dateISO: addDaysToColomboToday(120),
    time: "09:00",
    peopleCount: 2,
    name: "Test Guest",
    phone: "0771234567",
    email,
    idempotencyKey: uniqueKey("guest"),
    ...overrides,
  };
}

describe("environment sanity — never production", () => {
  it("this test run only ever talks to the local emulator", () => {
    expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy();
    const projectId = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT ?? "";
    expect(projectId.startsWith("demo-")).toBe(true);
  });
});

describe("getPackages / getAvailability — public, safe reads", () => {
  it("getPackages returns the seeded catalog including Party (marked non-bookable)", async () => {
    const result = await getPackages({});
    const packages = result.data.packages as Array<{ id: string; isBookableOnline: boolean }>;
    expect(packages.map((p) => p.id).sort()).toEqual(["ac-large", "ac-small", "non-ac", "party"]);
    const party = packages.find((p) => p.id === "party");
    expect(party?.isBookableOnline).toBe(false);
  });

  it("getAvailability response contains no PII — only aggregate slot data", async () => {
    const dateISO = addDaysToColomboToday(121);
    const result = await getAvailability({ packageId: "non-ac", dateISO });
    for (const slot of result.data.slots) {
      expect(Object.keys(slot).sort()).toEqual(["roomsFree", "roomsTotal", "status", "time"]);
    }
    const serialized = JSON.stringify(result.data);
    expect(serialized).not.toMatch(/@/); // no email anywhere
    expect(serialized).not.toContain("bookingId");
  });

  it("rejects a non-bookable package (party) from availability", async () => {
    const dateISO = addDaysToColomboToday(121);
    await expect(getAvailability({ packageId: "party", dateISO })).rejects.toThrow();
  });
});

describe("validation — invalid input is rejected, not silently accepted", () => {
  const dateISO = addDaysToColomboToday(122);

  it("rejects an out-of-capacity people count", async () => {
    await expect(createHold(guest("cap-over@example.com", { dateISO, peopleCount: 99 }))).rejects.toThrow();
  });

  it("rejects zero people", async () => {
    await expect(createHold(guest("cap-zero@example.com", { dateISO, peopleCount: 0 }))).rejects.toThrow();
  });

  it("rejects a non-public start time", async () => {
    await expect(createHold(guest("bad-time@example.com", { dateISO, time: "10:00" }))).rejects.toThrow();
  });

  it("rejects a malformed date", async () => {
    await expect(createHold(guest("bad-date@example.com", { dateISO: "not-a-date" }))).rejects.toThrow();
  });

  it("rejects a past date", async () => {
    await expect(createHold(guest("past-date@example.com", { dateISO: "2020-01-01" }))).rejects.toThrow();
  });

  it("rejects party (not bookable online)", async () => {
    await expect(createHold(guest("party-guest@example.com", { packageId: "party", dateISO }))).rejects.toThrow();
  });

  it("ignores a tampered/extra amount field — the server computes its own price regardless", async () => {
    const result = await createHold(
      guest("tamper@example.com", { dateISO, time: "15:00", totalAmountMinor: 1, priceLKR: 1 }),
    );
    // ac-small is LKR 3,200 → 320000 minor units, never the tampered "1".
    expect(result.data.totalAmountMinor).toBe(320000);
  });
});

describe("idempotency", () => {
  it("an exact retry (same key, same request) returns the original result — no duplicate reservation", async () => {
    const request = guest("idempotent@example.com", { dateISO: addDaysToColomboToday(123), time: "09:00" });
    const first = await createHold(request);
    const second = await createHold(request);
    expect(second.data.holdId).toBe(first.data.holdId);
    expect(second.data.referenceCode).toBe(first.data.referenceCode);

    // Only one interval should exist for that room+date — read it directly.
    const dateISO = request.dateISO;
    const db = getFirestore();
    const roomSnap = await db.collection(COLLECTIONS.inventory).doc(inventoryDocId("room-4", dateISO)).get();
    const intervals = (roomSnap.data()?.intervals ?? []) as unknown[];
    expect(intervals).toHaveLength(1);
  });

  it("reusing the same key with a DIFFERENT request is rejected, not silently served", async () => {
    const key = uniqueKey("conflict");
    const dateISO = addDaysToColomboToday(124);
    await createHold(guest("conflict-a@example.com", { dateISO, time: "09:00", idempotencyKey: key }));
    await expect(
      createHold(guest("conflict-b@example.com", { dateISO, time: "12:00", idempotencyKey: key })),
    ).rejects.toThrow();
  });
});

describe("concurrency — at most as many holds succeed as there are rooms", () => {
  it("two simultaneous requests for AC Small (1 room): at most one succeeds", async () => {
    const dateISO = addDaysToColomboToday(130);
    const time = "09:00";
    const results = await Promise.allSettled([
      createHold(guest("concurrent-ac-1@example.com", { dateISO, time })),
      createHold(guest("concurrent-ac-2@example.com", { dateISO, time })),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const rejection = (rejected[0] as PromiseRejectedResult).reason as FunctionsError;
    expect(rejection.code).toBe("functions/failed-precondition");
  });

  it("four simultaneous requests for Non-AC (3 rooms): at most three succeed", async () => {
    const dateISO = addDaysToColomboToday(131);
    const time = "09:00";
    const results = await Promise.allSettled(
      ["a", "b", "c", "d"].map((label) =>
        createHold(guest(`concurrent-nonac-${label}@example.com`, { packageId: "non-ac", dateISO, time })),
      ),
    );
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(3);
    expect(rejected).toHaveLength(1);
  });
});

describe("failed transactions leave no partial inventory change", () => {
  it("a sold-out attempt does not add an interval to any room's inventory", async () => {
    const dateISO = addDaysToColomboToday(132);
    const time = "09:00";
    // Fill the only AC Small room.
    await createHold(guest("fill@example.com", { dateISO, time }));

    const db = getFirestore();
    const before = (
      (await db.collection(COLLECTIONS.inventory).doc(inventoryDocId("room-4", dateISO)).get()).data()
        ?.intervals ?? []
    ) as unknown[];

    await expect(createHold(guest("overflow@example.com", { dateISO, time }))).rejects.toThrow();

    const after = (
      (await db.collection(COLLECTIONS.inventory).doc(inventoryDocId("room-4", dateISO)).get()).data()
        ?.intervals ?? []
    ) as unknown[];
    expect(after).toHaveLength(before.length);
  });
});

describe("adjacency and partial-overlap blocking", () => {
  it("adjacent sessions (09:00-12:00 then 12:00-15:00) on the same single room do not conflict", async () => {
    const dateISO = addDaysToColomboToday(140);
    const first = await createHold(guest("adjacent-1@example.com", { dateISO, time: "09:00" }));
    const second = await createHold(guest("adjacent-2@example.com", { dateISO, time: "12:00" }));
    expect(first.data.holdId).not.toBe(second.data.holdId);
  });

  it("a 09:00-13:00 occupied interval blocks the 12:00-15:00 slot (partial overlap, not just exact match)", async () => {
    const dateISO = addDaysToColomboToday(141);
    const roomId = "room-4"; // ac-small's only room
    const db = getFirestore();

    // Simulate an approved +1 hour extension (09:00–13:00) directly, the way
    // a future extension-approval function would write it — same inventory
    // shape, confirmed status so it isn't hold-expiry-dependent.
    await db
      .collection(COLLECTIONS.inventory)
      .doc(inventoryDocId(roomId, dateISO))
      .set({
        roomId,
        dateISO,
        intervals: [
          { bookingId: "seed-extension", startMinute: 9 * 60, endMinute: 13 * 60, status: "confirmed", holdExpiresAtMillis: null },
        ],
      });

    const availability = await getAvailability({ packageId: "ac-small", dateISO });
    const noon = availability.data.slots.find((s) => s.time === "12:00");
    expect(noon?.status).toBe("full");

    await expect(createHold(guest("blocked-noon@example.com", { dateISO, time: "12:00" }))).rejects.toThrow();

    // 15:00 is untouched — proves this isn't a blanket "whole day blocked" bug.
    const threePm = availability.data.slots.find((s) => s.time === "15:00");
    expect(threePm?.status).toBe("available");
  });
});

describe("expired holds become reusable", () => {
  it("a hold whose expiry has passed no longer blocks a new request for the same room/slot", async () => {
    const dateISO = addDaysToColomboToday(150);
    const time = "09:00";
    const original = await createHold(guest("expiring@example.com", { dateISO, time }));

    // Directly backdate the hold's expiry in Firestore — simulating time
    // passing without an unreliable real sleep, and proving correctness
    // does not depend on a background sweep (docs/ARCHITECTURE.md §6).
    const db = getFirestore();
    const ref = db.collection(COLLECTIONS.inventory).doc(inventoryDocId("room-4", dateISO));
    const snap = await ref.get();
    const intervals = (snap.data()?.intervals ?? []) as Array<Record<string, unknown>>;
    const patched = intervals.map((interval) =>
      interval.bookingId === original.data.holdId ? { ...interval, holdExpiresAtMillis: Date.now() - 60_000 } : interval,
    );
    await ref.update({ intervals: patched });

    // A brand-new request for the same room/slot must now succeed.
    const next = await createHold(guest("reclaimed@example.com", { dateISO, time }));
    expect(next.data.holdId).not.toBe(original.data.holdId);
  });
});
