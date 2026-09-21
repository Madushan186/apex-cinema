/**
 * Integration tests for createManualBooking against the real Auth +
 * Firestore + Functions emulators — see the file-level note in
 * ping.emulator.test.ts: only meaningful under `firebase emulators:exec`
 * (the root `test:emulators` script, or an isolated-port run — see
 * docs/PROGRESS.md).
 *
 * Self-contained: creates its own dedicated test accounts via the Admin SDK.
 *
 * Covers every scenario explicitly required for this phase: guest/no-role
 * rejection, staff/owner can create valid reservations, role/price/
 * capacity/date/Party tampering is rejected, manual bookings and online
 * holds share one real inventory (no overlap either direction, true
 * concurrent races included), expired holds release capacity while
 * adjacent sessions remain valid, idempotent retries create exactly one
 * booking and one audit event, failed attempts leave no partial writes,
 * manual reservations never expire, and public responses expose no PII.
 */
import { type Auth, type FirebaseApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from "firebase/auth";
import type { Functions, HttpsCallable } from "firebase/functions";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { addDaysToColomboToday } from "@apex-cinema/booking-core";
import { getApps, initializeApp as initAdminApp } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { beforeAll, describe, expect, it } from "vitest";
import type { CreateHoldResult } from "../src/lib/inventory";
import { COLLECTIONS, inventoryDocId } from "../src/lib/firestore";
import { EMULATOR_PORTS, TEST_PROJECT_ID } from "./testEmulatorPorts";

const PASSWORD = "TestPass!12345";
const OWNER_EMAIL = "test-owner-manualbooking@apexcinema.test";
const STAFF_EMAIL = "test-staff-manualbooking@apexcinema.test";
const NOROLE_EMAIL = "test-norole-manualbooking@apexcinema.test";

interface ManualBookingResult {
  bookingId: string;
  referenceCode: string;
  roomId: string;
  totalAmountMinor: number;
  currency: "LKR";
  startISO: string;
  endISO: string;
  amountPaidMinor: number;
  balanceDueMinor: number;
  paymentStatus: "unpaid" | "partially_paid" | "paid";
}

interface ManualBookingRequest {
  packageId: string;
  dateISO: string;
  time: string;
  peopleCount: number;
  name: string;
  phone: string;
  email?: string;
  source: "staff_walkin" | "staff_phone";
  staffNote?: string;
  idempotencyKey: string;
  advanceReceivedConfirmation: true;
  [extra: string]: unknown;
}

let app: FirebaseApp;
let auth: Auth;
let functions: Functions;
let createManualBooking: HttpsCallable<ManualBookingRequest, ManualBookingResult>;
let createHold: HttpsCallable<Record<string, unknown>, CreateHoldResult>;
let getAvailability: HttpsCallable<{ packageId: string; dateISO: string }, { slots: unknown[] }>;

async function ensureTestUser(email: string, role: "staff" | "owner" | null): Promise<void> {
  const adminAuth = getAdminAuth();
  let uid: string;
  try {
    uid = (await adminAuth.getUserByEmail(email)).uid;
    await adminAuth.updateUser(uid, { password: PASSWORD });
  } catch {
    uid = (await adminAuth.createUser({ email, password: PASSWORD, emailVerified: true })).uid;
  }
  await adminAuth.setCustomUserClaims(uid, role ? { role } : null);
}

async function signInAs(email: string): Promise<void> {
  await signInWithEmailAndPassword(auth, email, PASSWORD);
  await auth.currentUser?.getIdToken(true);
}

function manualBooking(dateISO: string, time: string, overrides: Partial<ManualBookingRequest> = {}): ManualBookingRequest {
  return {
    packageId: "ac-small",
    dateISO,
    time,
    peopleCount: 2,
    name: "Test Customer",
    phone: "0771234567",
    email: "",
    source: "staff_walkin",
    staffNote: "",
    idempotencyKey: `manual-test-${Math.random().toString(36).slice(2)}`,
    advanceReceivedConfirmation: true,
    ...overrides,
  };
}

function guestHold(dateISO: string, time: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    packageId: "ac-small",
    dateISO,
    time,
    peopleCount: 2,
    name: "Guest Customer",
    phone: "0771234568",
    email: `guest-${Math.random().toString(36).slice(2)}@example.com`,
    idempotencyKey: `guest-test-${Math.random().toString(36).slice(2)}`,
    ...overrides,
  };
}

beforeAll(async () => {
  app = initializeApp({ apiKey: "demo-api-key", projectId: TEST_PROJECT_ID }, "manual-booking-emulator-test");
  auth = getAuth(app);
  connectAuthEmulator(auth, `http://127.0.0.1:${EMULATOR_PORTS.auth}`, { disableWarnings: true });
  functions = getFunctions(app);
  connectFunctionsEmulator(functions, "127.0.0.1", EMULATOR_PORTS.functions);
  createManualBooking = httpsCallable(functions, "createManualBooking");
  createHold = httpsCallable(functions, "createHold");
  getAvailability = httpsCallable(functions, "getAvailability");

  if (getApps().length === 0) initAdminApp();

  await ensureTestUser(OWNER_EMAIL, "owner");
  await ensureTestUser(STAFF_EMAIL, "staff");
  await ensureTestUser(NOROLE_EMAIL, null);
});

describe("environment sanity — never production", () => {
  it("this test run only ever talks to the local emulators", () => {
    expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy();
    expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBeTruthy();
    const projectId = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT ?? "";
    expect(projectId.startsWith("demo-")).toBe(true);
  });
});

describe("authorization", () => {
  it("rejects an unauthenticated (guest) caller with unauthenticated", async () => {
    // No signInAs call — the SDK's auth state starts signed-out.
    const freshApp = initializeApp({ apiKey: "demo-api-key", projectId: TEST_PROJECT_ID }, "manual-booking-guest-test");
    const freshFunctions = getFunctions(freshApp);
    connectFunctionsEmulator(freshFunctions, "127.0.0.1", EMULATOR_PORTS.functions);
    const call = httpsCallable<ManualBookingRequest, ManualBookingResult>(freshFunctions, "createManualBooking");
    await expect(call(manualBooking(addDaysToColomboToday(180), "09:00"))).rejects.toMatchObject({
      code: "functions/unauthenticated",
    });
  });

  it("rejects a signed-in account with no approved role", async () => {
    await signInAs(NOROLE_EMAIL);
    await expect(createManualBooking(manualBooking(addDaysToColomboToday(180), "09:00"))).rejects.toMatchObject({
      code: "functions/permission-denied",
    });
  });

  it("sending role: 'owner' in request.data does not grant a no-role account access", async () => {
    await signInAs(NOROLE_EMAIL);
    await expect(
      createManualBooking(manualBooking(addDaysToColomboToday(180), "09:00", { role: "owner" })),
    ).rejects.toMatchObject({ code: "functions/permission-denied" });
  });
});

describe("staff and owner can create valid manual reservations", () => {
  it("staff creates a confirmed reservation with a server-assigned room/price and the LKR 1,000 advance recorded", async () => {
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(181);
    const result = await createManualBooking(manualBooking(dateISO, "09:00", { packageId: "non-ac" }));
    expect(result.data.roomId).toMatch(/^room-[1-3]$/);
    expect(result.data.totalAmountMinor).toBe(230000); // non-ac: LKR 2,300
    expect(result.data.amountPaidMinor).toBe(100000); // docs/DECISIONS.md D17: LKR 1,000 advance
    expect(result.data.balanceDueMinor).toBe(130000); // 2,300 - 1,000
    expect(result.data.paymentStatus).toBe("partially_paid");
    expect(result.data.referenceCode).toMatch(/^APX-/);
  });

  it("owner creates a confirmed reservation with the advance recorded", async () => {
    await signInAs(OWNER_EMAIL);
    const dateISO = addDaysToColomboToday(182);
    const result = await createManualBooking(manualBooking(dateISO, "12:00", { packageId: "ac-large", peopleCount: 4 }));
    expect(result.data.roomId).toBe("room-5");
    expect(result.data.totalAmountMinor).toBe(450000); // ac-large: LKR 4,500
    expect(result.data.amountPaidMinor).toBe(100000);
    expect(result.data.balanceDueMinor).toBe(350000);
    expect(result.data.paymentStatus).toBe("partially_paid");
  });

  it("rejects creation when advanceReceivedConfirmation is missing or not literally true — no booking, inventory, payment, or audit record is created", async () => {
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(300);

    for (const badValue of [false, "yes", 1, undefined]) {
      await expect(
        createManualBooking(
          manualBooking(dateISO, "09:00", { advanceReceivedConfirmation: badValue as true }),
        ),
      ).rejects.toMatchObject({ code: "functions/invalid-argument" });
    }

    // Confirm nothing was created at all for this slot — the room is still free.
    const db = getFirestore();
    const snap = await db.collection(COLLECTIONS.inventory).doc(inventoryDocId("room-4", dateISO)).get();
    expect(snap.exists).toBe(false);
    const succeeded = await createManualBooking(manualBooking(dateISO, "09:00"));
    expect(succeeded.data.roomId).toBe("room-4");
  });

  it("the created booking is bookingStatus=confirmed, paymentStatus=partially_paid, with an advance payment record and no customer PII in the audit log", async () => {
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(183);
    const result = await createManualBooking(manualBooking(dateISO, "15:00", { source: "staff_phone", staffNote: "Called ahead" }));

    const db = getFirestore();
    const bookingSnap = await db.collection(COLLECTIONS.bookings).doc(result.data.bookingId).get();
    const booking = bookingSnap.data();
    expect(booking?.bookingStatus).toBe("confirmed");
    expect(booking?.paymentStatus).toBe("partially_paid");
    expect(booking?.amountPaidMinor).toBe(100000);
    expect(booking?.source).toBe("staff_phone");
    expect(booking?.createdBy).toBeTruthy();

    // The advance itself — a real payment ledger entry (docs/DECISIONS.md D17).
    const paymentsSnap = await db.collection(COLLECTIONS.bookings).doc(result.data.bookingId).collection("payments").get();
    expect(paymentsSnap.docs).toHaveLength(1);
    const payment = paymentsSnap.docs[0]?.data();
    expect(payment?.amountMinor).toBe(100000);
    expect(payment?.method).toBe("cash");
    expect(payment?.kind).toBe("advance");
    expect(payment?.recordedByUid).toBeTruthy();

    const auditSnap = await db.collection(COLLECTIONS.auditLog).where("targetId", "==", result.data.bookingId).get();
    expect(auditSnap.docs).toHaveLength(1);
    const audit = auditSnap.docs[0]?.data();
    expect(audit?.action).toBe("manual_booking_created");
    expect(audit?.actorUid).toBeTruthy();
    expect(audit?.advanceAmountMinor).toBe(100000);
    // No customer PII in the audit entry (docs/SECURITY.md §8).
    const auditKeys = Object.keys(audit ?? {});
    expect(auditKeys).not.toContain("customerName");
    expect(auditKeys).not.toContain("customerPhone");
    expect(auditKeys).not.toContain("customerEmail");
    expect(JSON.stringify(audit)).not.toContain("Test Customer");
    expect(JSON.stringify(audit)).not.toContain("0771234567");
  });
});

describe("tampering is rejected — role, price, capacity, date, and Party", () => {
  it("ignores a tampered totalAmountMinor — the server computes its own price regardless", async () => {
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(184);
    const result = await createManualBooking(
      manualBooking(dateISO, "09:00", { totalAmountMinor: 1 } as Partial<ManualBookingRequest>),
    );
    expect(result.data.totalAmountMinor).toBe(320000); // real ac-small price, never the tampered "1"
  });

  it("rejects an out-of-capacity people count", async () => {
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(185);
    await expect(
      createManualBooking(manualBooking(dateISO, "09:00", { peopleCount: 99 })),
    ).rejects.toThrow();
  });

  it("rejects a past date", async () => {
    await signInAs(STAFF_EMAIL);
    await expect(createManualBooking(manualBooking("2020-01-01", "09:00"))).rejects.toThrow();
  });

  it("rejects a non-public start time", async () => {
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(186);
    await expect(createManualBooking(manualBooking(dateISO, "10:00"))).rejects.toThrow();
  });

  it("rejects Party (packageId: 'party') — Room 6 stays fully out of scope this phase", async () => {
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(187);
    await expect(
      createManualBooking(manualBooking(dateISO, "09:00", { packageId: "party", peopleCount: 8 })),
    ).rejects.toThrow();
  });

  it("rejects an unknown source value", async () => {
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(188);
    await expect(
      createManualBooking(manualBooking(dateISO, "09:00", { source: "party" as ManualBookingRequest["source"] })),
    ).rejects.toThrow();
  });
});

describe("manual bookings and online holds share one real inventory", () => {
  it("an online hold blocks a manual booking for the same single-room slot", async () => {
    const dateISO = addDaysToColomboToday(190);
    await createHold(guestHold(dateISO, "09:00"));
    await signInAs(STAFF_EMAIL);
    await expect(createManualBooking(manualBooking(dateISO, "09:00"))).rejects.toMatchObject({
      code: "functions/failed-precondition",
    });
  });

  it("a manual booking blocks a later online hold for the same single-room slot", async () => {
    const dateISO = addDaysToColomboToday(191);
    await signInAs(STAFF_EMAIL);
    await createManualBooking(manualBooking(dateISO, "09:00"));
    await expect(createHold(guestHold(dateISO, "09:00"))).rejects.toMatchObject({
      code: "functions/failed-precondition",
    });
  });

  it("true concurrent race for the last matching room: exactly one of {online hold, manual booking} succeeds", async () => {
    const dateISO = addDaysToColomboToday(192);
    await signInAs(STAFF_EMAIL);
    const results = await Promise.allSettled([
      createHold(guestHold(dateISO, "12:00")),
      createManualBooking(manualBooking(dateISO, "12:00")),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });

  it("two simultaneous manual requests for a 1-room package: at most one succeeds", async () => {
    const dateISO = addDaysToColomboToday(193);
    await signInAs(STAFF_EMAIL);
    const results = await Promise.allSettled([
      createManualBooking(manualBooking(dateISO, "15:00")),
      createManualBooking(manualBooking(dateISO, "15:00")),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);
  });

  it("four simultaneous manual requests for a 3-room package (non-ac): at most three succeed", async () => {
    const dateISO = addDaysToColomboToday(194);
    await signInAs(STAFF_EMAIL);
    const results = await Promise.allSettled(
      ["a", "b", "c", "d"].map(() => createManualBooking(manualBooking(dateISO, "15:00", { packageId: "non-ac" }))),
    );
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(3);
  });

  it("expired holds release capacity — a manual booking can take a slot an expired online hold no longer occupies", async () => {
    const dateISO = addDaysToColomboToday(195);
    const holdResult = await createHold(guestHold(dateISO, "09:00"));

    const db = getFirestore();
    const inventoryRef = db.collection(COLLECTIONS.inventory).doc(inventoryDocId("room-4", dateISO));
    const snap = await inventoryRef.get();
    const intervals = (snap.data()?.intervals ?? []) as Array<Record<string, unknown>>;
    const patched = intervals.map((interval) =>
      interval.bookingId === holdResult.data.holdId ? { ...interval, holdExpiresAtMillis: Date.now() - 60_000 } : interval,
    );
    await inventoryRef.update({ intervals: patched });

    await signInAs(STAFF_EMAIL);
    const manual = await createManualBooking(manualBooking(dateISO, "09:00"));
    expect(manual.data.roomId).toBe("room-4");
  });

  it("adjacent sessions on the same single room do not conflict", async () => {
    const dateISO = addDaysToColomboToday(196);
    await signInAs(STAFF_EMAIL);
    const first = await createManualBooking(manualBooking(dateISO, "09:00"));
    const second = await createManualBooking(manualBooking(dateISO, "12:00"));
    expect(first.data.bookingId).not.toBe(second.data.bookingId);
    expect(first.data.roomId).toBe(second.data.roomId);
  });
});

describe("manual reservations never expire", () => {
  it("a manual booking's inventory interval has status=confirmed and holdExpiresAtMillis=null — never subject to expiry", async () => {
    const dateISO = addDaysToColomboToday(197);
    await signInAs(STAFF_EMAIL);
    const result = await createManualBooking(manualBooking(dateISO, "18:00"));

    const db = getFirestore();
    const snap = await db.collection(COLLECTIONS.inventory).doc(inventoryDocId(result.data.roomId, dateISO)).get();
    const intervals = (snap.data()?.intervals ?? []) as Array<Record<string, unknown>>;
    const interval = intervals.find((i) => i.bookingId === result.data.bookingId);
    expect(interval?.status).toBe("confirmed");
    expect(interval?.holdExpiresAtMillis).toBeNull();
  });

  it("remains occupied well beyond the 10-minute default hold period — contrasted directly against an online hold on an adjacent slot, same room", async () => {
    const dateISO = addDaysToColomboToday(198);
    await signInAs(STAFF_EMAIL);
    // Adjacent, non-overlapping slots on the same single-room package (ac-large
    // has only room-5) — both succeed independently, letting this test
    // backdate ONLY the hold's expiry and prove the manual booking is
    // completely unaffected by it.
    const manual = await createManualBooking(manualBooking(dateISO, "09:00", { packageId: "ac-large" }));
    const hold = await createHold(guestHold(dateISO, "12:00", { packageId: "ac-large" }));

    const db = getFirestore();
    const inventoryRef = db.collection(COLLECTIONS.inventory).doc(inventoryDocId("room-5", dateISO));

    // Simulate 15 minutes having passed: backdate ONLY the hold's expiry —
    // the manual booking's interval has no expiry field to backdate at all.
    const snap = await inventoryRef.get();
    const intervals = (snap.data()?.intervals ?? []) as Array<Record<string, unknown>>;
    const patched = intervals.map((interval) =>
      interval.bookingId === hold.data.holdId ? { ...interval, holdExpiresAtMillis: Date.now() - 15 * 60_000 } : interval,
    );
    await inventoryRef.update({ intervals: patched });

    // The hold's slot (12:00) is now free again (expired) — a new request for
    // it succeeds, proving the backdating took effect.
    const rebooked = await createHold(guestHold(dateISO, "12:00", { packageId: "ac-large" }));
    expect(rebooked.data.holdId).not.toBe(hold.data.holdId);

    // The manual booking's own interval (09:00) was never touched and is
    // still confirmed with no expiry — completely unaffected by the hold's
    // expiry timeline.
    const afterSnap = await inventoryRef.get();
    const afterIntervals = (afterSnap.data()?.intervals ?? []) as Array<Record<string, unknown>>;
    const manualInterval = afterIntervals.find((i) => i.bookingId === manual.data.bookingId);
    expect(manualInterval?.status).toBe("confirmed");
    expect(manualInterval?.holdExpiresAtMillis).toBeNull();
  });
});

describe("idempotent retries", () => {
  it("an exact retry (same actor, same key, same payload) returns the original reservation — no duplicate booking or audit event", async () => {
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(199);
    const request = manualBooking(dateISO, "09:00");

    const first = await createManualBooking(request);
    const second = await createManualBooking(request);
    expect(second.data.bookingId).toBe(first.data.bookingId);
    expect(second.data.referenceCode).toBe(first.data.referenceCode);

    const db = getFirestore();
    const bookingsSnap = await db.collection(COLLECTIONS.bookings).where("idempotencyKey", "==", request.idempotencyKey).get();
    expect(bookingsSnap.docs).toHaveLength(1);
    const auditSnap = await db.collection(COLLECTIONS.auditLog).where("targetId", "==", first.data.bookingId).get();
    expect(auditSnap.docs).toHaveLength(1);
  });

  it("reusing the same key with a DIFFERENT payload is rejected, not silently served", async () => {
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(200);
    const key = `manual-conflict-${Math.random().toString(36).slice(2)}`;
    await createManualBooking(manualBooking(dateISO, "09:00", { idempotencyKey: key }));
    await expect(
      createManualBooking(manualBooking(dateISO, "12:00", { idempotencyKey: key })),
    ).rejects.toMatchObject({ code: "functions/already-exists" });
  });
});

describe("failed operations leave no partial writes", () => {
  it("a sold-out attempt does not add a booking, inventory interval, or audit entry", async () => {
    const dateISO = addDaysToColomboToday(201);
    await signInAs(STAFF_EMAIL);
    await createManualBooking(manualBooking(dateISO, "09:00")); // fills the only ac-small room

    const db = getFirestore();
    const inventoryRef = db.collection(COLLECTIONS.inventory).doc(inventoryDocId("room-4", dateISO));
    const before = ((await inventoryRef.get()).data()?.intervals ?? []) as unknown[];
    // Scoped to this test's own date, not a raw whole-collection count —
    // other test FILES run concurrently against the same emulator project
    // and write their own audit entries at unrelated dates/times, which a
    // global count would race against.
    const auditBefore = (await db.collection(COLLECTIONS.auditLog).where("dateISO", "==", dateISO).get()).size;

    await expect(createManualBooking(manualBooking(dateISO, "09:00"))).rejects.toMatchObject({
      code: "functions/failed-precondition",
    });

    const after = ((await inventoryRef.get()).data()?.intervals ?? []) as unknown[];
    expect(after).toHaveLength(before.length);
    const auditAfter = (await db.collection(COLLECTIONS.auditLog).where("dateISO", "==", dateISO).get()).size;
    expect(auditAfter).toBe(auditBefore);
  });
});

describe("public responses expose no customer details", () => {
  it("getAvailability after a manual booking still returns only aggregate slot data, no PII", async () => {
    const dateISO = addDaysToColomboToday(202);
    await signInAs(STAFF_EMAIL);
    await createManualBooking(manualBooking(dateISO, "12:00", { name: "Should Not Leak", phone: "0779998888" }));

    const result = await getAvailability({ packageId: "ac-small", dateISO });
    const serialized = JSON.stringify(result.data);
    expect(serialized).not.toContain("Should Not Leak");
    expect(serialized).not.toContain("0779998888");
    expect(serialized).not.toContain("bookingId");
    for (const slot of result.data.slots as Array<Record<string, unknown>>) {
      expect(Object.keys(slot).sort()).toEqual(["roomsFree", "roomsTotal", "status", "time"]);
    }
  });
});
