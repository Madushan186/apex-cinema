/**
 * Integration tests for cancelManualBooking against the real Auth +
 * Firestore + Functions emulators — see the file-level note in
 * ping.emulator.test.ts: only meaningful under `firebase emulators:exec`
 * (the root `test:emulators` script, or an isolated-port run — see
 * docs/PROGRESS.md).
 *
 * Self-contained: creates its own dedicated test accounts via the Admin
 * SDK, distinct emails from manualBooking.emulator.test.ts's so the two
 * files never collide on the same account.
 *
 * Covers every scenario explicitly required for this phase: guest/no-role
 * rejection, staff/owner success, rejecting an already-started/paid/
 * online/Party booking, rejecting an empty reason, repeated cancellation
 * being safe (idempotent, no duplicate audit, no repeated release), a
 * cancelled slot becoming bookable again without double-booking, and
 * cancelling one booking never affecting another booking's interval.
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
const OWNER_EMAIL = "test-owner-cancelbooking@apexcinema.test";
const STAFF_EMAIL = "test-staff-cancelbooking@apexcinema.test";
const NOROLE_EMAIL = "test-norole-cancelbooking@apexcinema.test";

interface ManualBookingResult {
  bookingId: string;
  referenceCode: string;
  roomId: string;
  totalAmountMinor: number;
  currency: "LKR";
  startISO: string;
  endISO: string;
  paymentStatus: "unpaid";
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
  [extra: string]: unknown;
}

interface CancelResult {
  bookingId: string;
  bookingStatus: "cancelled";
  cancelledAtMillis: number;
  cancelledBy: string;
  roomId: string;
  dateISO: string;
}

interface CancelRequest {
  bookingId: string;
  reason: string;
  [extra: string]: unknown;
}

let app: FirebaseApp;
let auth: Auth;
let functions: Functions;
let createManualBooking: HttpsCallable<ManualBookingRequest, ManualBookingResult>;
let cancelManualBooking: HttpsCallable<CancelRequest, CancelResult>;
let createHold: HttpsCallable<Record<string, unknown>, CreateHoldResult>;

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
    idempotencyKey: `cancel-test-create-${Math.random().toString(36).slice(2)}`,
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
    idempotencyKey: `cancel-test-guest-${Math.random().toString(36).slice(2)}`,
    ...overrides,
  };
}

beforeAll(async () => {
  app = initializeApp({ apiKey: "demo-api-key", projectId: TEST_PROJECT_ID }, "cancel-booking-emulator-test");
  auth = getAuth(app);
  connectAuthEmulator(auth, `http://127.0.0.1:${EMULATOR_PORTS.auth}`, { disableWarnings: true });
  functions = getFunctions(app);
  connectFunctionsEmulator(functions, "127.0.0.1", EMULATOR_PORTS.functions);
  createManualBooking = httpsCallable(functions, "createManualBooking");
  cancelManualBooking = httpsCallable(functions, "cancelManualBooking");
  createHold = httpsCallable(functions, "createHold");

  if (getApps().length === 0) initAdminApp();

  await ensureTestUser(OWNER_EMAIL, "owner");
  await ensureTestUser(STAFF_EMAIL, "staff");
  await ensureTestUser(NOROLE_EMAIL, null);
});

describe("authorization", () => {
  it("rejects an unauthenticated (guest) caller with unauthenticated", async () => {
    const freshApp = initializeApp({ apiKey: "demo-api-key", projectId: TEST_PROJECT_ID }, "cancel-booking-guest-test");
    const freshFunctions = getFunctions(freshApp);
    connectFunctionsEmulator(freshFunctions, "127.0.0.1", EMULATOR_PORTS.functions);
    const call = httpsCallable<CancelRequest, CancelResult>(freshFunctions, "cancelManualBooking");
    await expect(call({ bookingId: "does-not-matter", reason: "test" })).rejects.toMatchObject({
      code: "functions/unauthenticated",
    });
  });

  it("rejects a signed-in account with no approved role", async () => {
    await signInAs(NOROLE_EMAIL);
    await expect(cancelManualBooking({ bookingId: "does-not-matter", reason: "test" })).rejects.toMatchObject({
      code: "functions/permission-denied",
    });
  });

  it("sending role: 'owner' in request.data does not grant a no-role account access", async () => {
    await signInAs(NOROLE_EMAIL);
    await expect(
      cancelManualBooking({ bookingId: "does-not-matter", reason: "test", role: "owner" }),
    ).rejects.toMatchObject({ code: "functions/permission-denied" });
  });
});

describe("staff and owner can cancel a valid manual reservation", () => {
  it("staff cancels a confirmed manual booking", async () => {
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(210);
    const created = await createManualBooking(manualBooking(dateISO, "09:00"));

    const result = await cancelManualBooking({ bookingId: created.data.bookingId, reason: "Customer called to cancel" });
    expect(result.data.bookingStatus).toBe("cancelled");
    expect(result.data.bookingId).toBe(created.data.bookingId);
    expect(result.data.roomId).toBe(created.data.roomId);
    expect(typeof result.data.cancelledAtMillis).toBe("number");
    expect(result.data.cancelledAtMillis).toBeGreaterThan(0);

    const db = getFirestore();
    const bookingSnap = await db.collection(COLLECTIONS.bookings).doc(created.data.bookingId).get();
    const booking = bookingSnap.data();
    expect(booking?.bookingStatus).toBe("cancelled");
    // Payment status is never touched by cancellation (docs/DECISIONS.md D12/D15).
    expect(booking?.paymentStatus).toBe("unpaid");
    expect(booking?.cancellationReason).toBe("Customer called to cancel");
    expect(booking?.cancelledBy).toBeTruthy();
    // Booking history is preserved, not deleted — original fields untouched.
    expect(booking?.customerName).toBe("Test Customer");
    expect(booking?.referenceCode).toBe(created.data.referenceCode);
  });

  it("owner cancels a confirmed manual booking", async () => {
    await signInAs(OWNER_EMAIL);
    const dateISO = addDaysToColomboToday(211);
    const created = await createManualBooking(manualBooking(dateISO, "12:00"));

    const result = await cancelManualBooking({ bookingId: created.data.bookingId, reason: "Double-booked by phone" });
    expect(result.data.bookingStatus).toBe("cancelled");
  });

  it("writes exactly one manual_booking_cancelled audit entry with a before/after diff and no customer PII", async () => {
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(212);
    const created = await createManualBooking(manualBooking(dateISO, "15:00", { name: "Should Not Leak", phone: "0779998888" }));
    await cancelManualBooking({ bookingId: created.data.bookingId, reason: "No longer needed — should not leak into audit" });

    const db = getFirestore();
    const auditSnap = await db
      .collection(COLLECTIONS.auditLog)
      .where("targetId", "==", created.data.bookingId)
      .where("action", "==", "manual_booking_cancelled")
      .get();
    expect(auditSnap.docs).toHaveLength(1);
    const audit = auditSnap.docs[0]?.data();
    expect(audit?.actorUid).toBeTruthy();
    expect(audit?.before).toEqual({ bookingStatus: "confirmed" });
    expect(audit?.after).toEqual({ bookingStatus: "cancelled" });
    const serialized = JSON.stringify(audit);
    expect(serialized).not.toContain("Should Not Leak");
    expect(serialized).not.toContain("0779998888");
    expect(serialized).not.toContain("should not leak into audit");
    const auditKeys = Object.keys(audit ?? {});
    expect(auditKeys).not.toContain("customerName");
    expect(auditKeys).not.toContain("customerPhone");
    expect(auditKeys).not.toContain("reason");
    expect(auditKeys).not.toContain("cancellationReason");
  });

  it("releases the inventory interval — the same slot can be booked again without double-booking", async () => {
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(213);
    const first = await createManualBooking(manualBooking(dateISO, "18:00", { packageId: "ac-large" }));
    await cancelManualBooking({ bookingId: first.data.bookingId, reason: "Freeing this slot up again" });

    // The exact same room/date/time is bookable again — proves the release
    // actually happened, not just that the booking doc says "cancelled".
    const second = await createManualBooking(manualBooking(dateISO, "18:00", { packageId: "ac-large" }));
    expect(second.data.bookingId).not.toBe(first.data.bookingId);
    expect(second.data.roomId).toBe(first.data.roomId);

    // Never two active bookings for the same room/time at once — a third,
    // concurrent attempt for the same now-reoccupied slot must fail.
    await expect(createManualBooking(manualBooking(dateISO, "18:00", { packageId: "ac-large" }))).rejects.toMatchObject({
      code: "functions/failed-precondition",
    });

    const db = getFirestore();
    const snap = await db.collection(COLLECTIONS.inventory).doc(inventoryDocId(first.data.roomId, dateISO)).get();
    const intervals = (snap.data()?.intervals ?? []) as Array<Record<string, unknown>>;
    const firstInterval = intervals.find((i) => i.bookingId === first.data.bookingId);
    const secondInterval = intervals.find((i) => i.bookingId === second.data.bookingId);
    expect(firstInterval?.status).toBe("cancelled");
    expect(firstInterval?.holdExpiresAtMillis).toBeNull();
    expect(secondInterval?.status).toBe("confirmed");
  });

  it("cancelling one booking has no effect on a different booking's interval, same room and date", async () => {
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(214);
    const morning = await createManualBooking(manualBooking(dateISO, "09:00", { packageId: "ac-large" }));
    const afternoon = await createManualBooking(manualBooking(dateISO, "15:00", { packageId: "ac-large" }));

    await cancelManualBooking({ bookingId: morning.data.bookingId, reason: "Cancelling only the morning session" });

    const db = getFirestore();
    const bookingSnap = await db.collection(COLLECTIONS.bookings).doc(afternoon.data.bookingId).get();
    expect(bookingSnap.data()?.bookingStatus).toBe("confirmed");

    const snap = await db.collection(COLLECTIONS.inventory).doc(inventoryDocId("room-5", dateISO)).get();
    const intervals = (snap.data()?.intervals ?? []) as Array<Record<string, unknown>>;
    const afternoonInterval = intervals.find((i) => i.bookingId === afternoon.data.bookingId);
    expect(afternoonInterval?.status).toBe("confirmed");
    expect(afternoonInterval?.holdExpiresAtMillis).toBeNull();
  });
});

describe("repeated cancellation is safe", () => {
  it("cancelling the same booking twice is idempotent — no duplicate audit entry, same result both times", async () => {
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(215);
    const created = await createManualBooking(manualBooking(dateISO, "09:00"));

    const first = await cancelManualBooking({ bookingId: created.data.bookingId, reason: "First cancel attempt" });
    const second = await cancelManualBooking({ bookingId: created.data.bookingId, reason: "Second, different reason text" });

    expect(second.data.bookingStatus).toBe("cancelled");
    expect(second.data.cancelledAtMillis).toBe(first.data.cancelledAtMillis);
    expect(second.data.cancelledBy).toBe(first.data.cancelledBy);

    const db = getFirestore();
    const auditSnap = await db
      .collection(COLLECTIONS.auditLog)
      .where("targetId", "==", created.data.bookingId)
      .where("action", "==", "manual_booking_cancelled")
      .get();
    expect(auditSnap.docs).toHaveLength(1);

    // The FIRST reason wins — a retry never overwrites the original record.
    const bookingSnap = await db.collection(COLLECTIONS.bookings).doc(created.data.bookingId).get();
    expect(bookingSnap.data()?.cancellationReason).toBe("First cancel attempt");

    // The interval is still released exactly once — a single entry, not duplicated.
    const invSnap = await db.collection(COLLECTIONS.inventory).doc(inventoryDocId(created.data.roomId, dateISO)).get();
    const intervals = (invSnap.data()?.intervals ?? []) as Array<Record<string, unknown>>;
    expect(intervals.filter((i) => i.bookingId === created.data.bookingId)).toHaveLength(1);
  });

  it("true concurrent double-click (two simultaneous cancel calls) still produces exactly one audit entry", async () => {
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(216);
    const created = await createManualBooking(manualBooking(dateISO, "12:00"));

    const results = await Promise.allSettled([
      cancelManualBooking({ bookingId: created.data.bookingId, reason: "Concurrent attempt A" }),
      cancelManualBooking({ bookingId: created.data.bookingId, reason: "Concurrent attempt B" }),
    ]);
    // Both calls are expected to resolve successfully — cancellation is
    // idempotent, not "first wins, second errors."
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);

    const db = getFirestore();
    const auditSnap = await db
      .collection(COLLECTIONS.auditLog)
      .where("targetId", "==", created.data.bookingId)
      .where("action", "==", "manual_booking_cancelled")
      .get();
    expect(auditSnap.docs).toHaveLength(1);
  });
});

describe("ineligible bookings are rejected", () => {
  it("rejects a booking that doesn't exist", async () => {
    await signInAs(STAFF_EMAIL);
    await expect(cancelManualBooking({ bookingId: "does-not-exist-at-all", reason: "test" })).rejects.toMatchObject({
      code: "functions/not-found",
    });
  });

  it("rejects an empty reason", async () => {
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(217);
    const created = await createManualBooking(manualBooking(dateISO, "09:00"));
    await expect(cancelManualBooking({ bookingId: created.data.bookingId, reason: "" })).rejects.toMatchObject({
      code: "functions/invalid-argument",
    });

    // Rejected before any write — the booking is still confirmed, not cancelled.
    const db = getFirestore();
    const bookingSnap = await db.collection(COLLECTIONS.bookings).doc(created.data.bookingId).get();
    expect(bookingSnap.data()?.bookingStatus).toBe("confirmed");
  });

  it("rejects a whitespace-only reason", async () => {
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(218);
    const created = await createManualBooking(manualBooking(dateISO, "09:00"));
    await expect(cancelManualBooking({ bookingId: created.data.bookingId, reason: "   " })).rejects.toMatchObject({
      code: "functions/invalid-argument",
    });
  });

  it("rejects an overlong reason", async () => {
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(219);
    const created = await createManualBooking(manualBooking(dateISO, "09:00"));
    await expect(
      cancelManualBooking({ bookingId: created.data.bookingId, reason: "x".repeat(501) }),
    ).rejects.toMatchObject({ code: "functions/invalid-argument" });
  });

  it("rejects an online hold/booking — this endpoint only ever cancels a manual reservation", async () => {
    const dateISO = addDaysToColomboToday(220);
    const hold = await createHold(guestHold(dateISO, "09:00"));
    await signInAs(STAFF_EMAIL);
    await expect(
      cancelManualBooking({ bookingId: hold.data.holdId, reason: "Attempting to cancel an online hold" }),
    ).rejects.toMatchObject({ code: "functions/failed-precondition" });

    // Untouched — still whatever the online hold's own state was.
    const db = getFirestore();
    const bookingSnap = await db.collection(COLLECTIONS.bookings).doc(hold.data.holdId).get();
    expect(bookingSnap.data()?.bookingStatus).toBe("pending_hold");
  });

  it("rejects a Party booking, even one that reached bookingStatus=confirmed by direct data manipulation", async () => {
    // There is no real way to create a Party manual booking through the
    // API this phase (createManualBooking already rejects packageId:
    // "party") — this directly writes a booking doc bypassing the create
    // function entirely, purely to prove the defense-in-depth Party check
    // inside cancelManualBookingTransactional actually rejects it too, not
    // just relying on "it can never exist" being true forever.
    const db = getFirestore();
    const dateISO = addDaysToColomboToday(221);
    const bookingRef = db.collection(COLLECTIONS.bookings).doc();
    await bookingRef.set({
      packageId: "party",
      roomId: "room-6",
      dateISO,
      startMinute: 9 * 60,
      endMinute: 12 * 60,
      bookingStatus: "confirmed",
      paymentStatus: "unpaid",
      totalAmountMinor: 1250000,
      currency: "LKR",
      peopleCount: 8,
      customerName: "Synthetic Party Test",
      customerPhone: "0770000000",
      customerEmail: "",
      referenceCode: "APX-SYNTHETIC",
      source: "staff_walkin",
      createdBy: "synthetic-test-setup",
      staffNote: "",
      idempotencyKey: `synthetic-party-${Math.random().toString(36).slice(2)}`,
      createdAt: new Date(),
    });

    await signInAs(STAFF_EMAIL);
    await expect(
      cancelManualBooking({ bookingId: bookingRef.id, reason: "Attempting to cancel a synthetic Party booking" }),
    ).rejects.toMatchObject({ code: "functions/failed-precondition" });

    const after = await bookingRef.get();
    expect(after.data()?.bookingStatus).toBe("confirmed");
  });

  it("rejects a booking whose paymentStatus is not unpaid, even by direct data manipulation", async () => {
    // No real way to create a "paid" manual booking this phase (D14 — the
    // field is fixed at creation) — directly patches an existing
    // confirmed manual booking's paymentStatus to prove the explicit
    // unpaid-only check actually rejects it, defense-in-depth against a
    // future phase that adds payment recording.
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(222);
    const created = await createManualBooking(manualBooking(dateISO, "09:00"));

    const db = getFirestore();
    await db.collection(COLLECTIONS.bookings).doc(created.data.bookingId).update({ paymentStatus: "succeeded" });

    await expect(
      cancelManualBooking({ bookingId: created.data.bookingId, reason: "Attempting to cancel a paid booking" }),
    ).rejects.toMatchObject({ code: "functions/failed-precondition" });

    const after = await db.collection(COLLECTIONS.bookings).doc(created.data.bookingId).get();
    expect(after.data()?.bookingStatus).toBe("confirmed");
  });

  it("rejects a booking whose session has already started — today, an already-passed start time", async () => {
    // createManualBooking itself refuses to create an already-passed-time
    // booking, so this directly writes one bypassing the create function,
    // purely to set up the "already started" scenario for cancellation.
    const db = getFirestore();
    const dateISO = addDaysToColomboToday(0); // today, in the server's own Asia/Colombo date
    const bookingRef = db.collection(COLLECTIONS.bookings).doc();
    await bookingRef.set({
      packageId: "ac-small",
      roomId: "room-4",
      dateISO,
      startMinute: 0, // 00:00 — guaranteed already passed, any time of day this test runs
      endMinute: 180,
      bookingStatus: "confirmed",
      paymentStatus: "unpaid",
      totalAmountMinor: 320000,
      currency: "LKR",
      peopleCount: 2,
      customerName: "Synthetic Already-Started Test",
      customerPhone: "0770000001",
      customerEmail: "",
      referenceCode: "APX-SYNTHETIC2",
      source: "staff_walkin",
      createdBy: "synthetic-test-setup",
      staffNote: "",
      idempotencyKey: `synthetic-started-${Math.random().toString(36).slice(2)}`,
      createdAt: new Date(),
    });
    // Give this a real, un-colliding inventory interval too, so a false
    // pass isn't possible via a missing-interval early exit.
    const inventoryRef = db.collection(COLLECTIONS.inventory).doc(inventoryDocId("room-4", dateISO));
    await inventoryRef.set({
      roomId: "room-4",
      dateISO,
      intervals: [{ bookingId: bookingRef.id, startMinute: 0, endMinute: 180, status: "confirmed", holdExpiresAtMillis: null }],
    });

    await signInAs(STAFF_EMAIL);
    await expect(
      cancelManualBooking({ bookingId: bookingRef.id, reason: "Attempting to cancel an already-started booking" }),
    ).rejects.toMatchObject({ code: "functions/failed-precondition" });

    // No Owner override this phase — owner is rejected identically.
    await signInAs(OWNER_EMAIL);
    await expect(
      cancelManualBooking({ bookingId: bookingRef.id, reason: "Owner attempting the same already-started booking" }),
    ).rejects.toMatchObject({ code: "functions/failed-precondition" });

    const after = await bookingRef.get();
    expect(after.data()?.bookingStatus).toBe("confirmed");
  });
});
