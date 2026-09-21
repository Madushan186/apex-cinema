/**
 * Integration tests for extendManualBooking against the real Auth +
 * Firestore + Functions emulators — see the file-level note in
 * ping.emulator.test.ts: only meaningful under `firebase emulators:exec`
 * (the root `test:emulators` script, or an isolated-port run — see
 * docs/PROGRESS.md).
 *
 * Self-contained: creates its own dedicated test accounts via the Admin
 * SDK, distinct emails from every other test file's.
 *
 * Covers every scenario explicitly required for this phase: staff/owner
 * success and unauthorized rejection, server-calculated amounts (client
 * price manipulation ignored), conflicts with reservations/active holds
 * (expired holds ignored), ending exactly at 21:00 allowed / later
 * rejected, ended/cancelled/paid/online-hold/Party bookings rejected,
 * retries and simultaneous extensions cannot double-apply, extension
 * racing with another booking cannot double-book, a 09:00–13:00
 * reservation blocks the 12:00–15:00 public slot, and cancellation
 * releases the entire extended interval.
 */
import { type Auth, type FirebaseApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from "firebase/auth";
import type { Functions, HttpsCallable } from "firebase/functions";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { addDaysToColomboToday, getColomboMinuteOfDay } from "@apex-cinema/booking-core";
import { getApps, initializeApp as initAdminApp } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { beforeAll, describe, expect, it } from "vitest";
import type { CreateHoldResult } from "../src/lib/inventory";
import { COLLECTIONS, inventoryDocId } from "../src/lib/firestore";
import { EMULATOR_PORTS, TEST_PROJECT_ID } from "./testEmulatorPorts";

const PASSWORD = "TestPass!12345";
const OWNER_EMAIL = "test-owner-extendbooking@apexcinema.test";
const STAFF_EMAIL = "test-staff-extendbooking@apexcinema.test";
const NOROLE_EMAIL = "test-norole-extendbooking@apexcinema.test";

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

interface ExtendResult {
  bookingId: string;
  roomId: string;
  dateISO: string;
  startMinute: number;
  previousEndMinute: number;
  newEndMinute: number;
  extensionFeeMinor: number;
  totalAmountMinor: number;
  extensionCount: number;
  extensionChargesMinor: number;
  newTotalAmountMinor: number;
  amountPaidMinor: number;
  balanceDueMinor: number;
  currency: "LKR";
}

interface ExtendRequest {
  bookingId: string;
  expectedCurrentEndMinute: number;
  idempotencyKey: string;
  [extra: string]: unknown;
}

interface AvailabilityResult {
  dateISO: string;
  packageId: string;
  slots: Array<{ time: string; status: string; roomsFree: number; roomsTotal: number }>;
}

let app: FirebaseApp;
let auth: Auth;
let functions: Functions;
let createManualBooking: HttpsCallable<ManualBookingRequest, ManualBookingResult>;
let extendManualBooking: HttpsCallable<ExtendRequest, ExtendResult>;
let cancelManualBooking: HttpsCallable<{ bookingId: string; reason: string }, { bookingId: string; bookingStatus: string }>;
let createHold: HttpsCallable<Record<string, unknown>, CreateHoldResult>;
let getAvailability: HttpsCallable<{ packageId: string; dateISO: string }, AvailabilityResult>;

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
    idempotencyKey: `extend-test-create-${Math.random().toString(36).slice(2)}`,
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
    idempotencyKey: `extend-test-guest-${Math.random().toString(36).slice(2)}`,
    ...overrides,
  };
}

function extendKey(): string {
  return `extend-test-key-${Math.random().toString(36).slice(2)}`;
}

beforeAll(async () => {
  app = initializeApp({ apiKey: "demo-api-key", projectId: TEST_PROJECT_ID }, "extend-booking-emulator-test");
  auth = getAuth(app);
  connectAuthEmulator(auth, `http://127.0.0.1:${EMULATOR_PORTS.auth}`, { disableWarnings: true });
  functions = getFunctions(app);
  connectFunctionsEmulator(functions, "127.0.0.1", EMULATOR_PORTS.functions);
  createManualBooking = httpsCallable(functions, "createManualBooking");
  extendManualBooking = httpsCallable(functions, "extendManualBooking");
  cancelManualBooking = httpsCallable(functions, "cancelManualBooking");
  createHold = httpsCallable(functions, "createHold");
  getAvailability = httpsCallable(functions, "getAvailability");

  if (getApps().length === 0) initAdminApp();

  await ensureTestUser(OWNER_EMAIL, "owner");
  await ensureTestUser(STAFF_EMAIL, "staff");
  await ensureTestUser(NOROLE_EMAIL, null);
});

describe("authorization", () => {
  it("rejects an unauthenticated (guest) caller with unauthenticated", async () => {
    const freshApp = initializeApp({ apiKey: "demo-api-key", projectId: TEST_PROJECT_ID }, "extend-booking-guest-test");
    const freshFunctions = getFunctions(freshApp);
    connectFunctionsEmulator(freshFunctions, "127.0.0.1", EMULATOR_PORTS.functions);
    const call = httpsCallable<ExtendRequest, ExtendResult>(freshFunctions, "extendManualBooking");
    await expect(
      call({ bookingId: "does-not-matter", expectedCurrentEndMinute: 720, idempotencyKey: extendKey() }),
    ).rejects.toMatchObject({ code: "functions/unauthenticated" });
  });

  it("rejects a signed-in account with no approved role", async () => {
    await signInAs(NOROLE_EMAIL);
    await expect(
      extendManualBooking({ bookingId: "does-not-matter", expectedCurrentEndMinute: 720, idempotencyKey: extendKey() }),
    ).rejects.toMatchObject({ code: "functions/permission-denied" });
  });

  it("sending role: 'owner' in request.data does not grant a no-role account access", async () => {
    await signInAs(NOROLE_EMAIL);
    await expect(
      extendManualBooking({ bookingId: "does-not-matter", expectedCurrentEndMinute: 720, idempotencyKey: extendKey(), role: "owner" }),
    ).rejects.toMatchObject({ code: "functions/permission-denied" });
  });
});

describe("staff and owner can extend a valid manual reservation", () => {
  it("staff extends a confirmed manual booking by exactly 60 minutes for LKR 1,000", async () => {
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(240);
    const created = await createManualBooking(manualBooking(dateISO, "09:00"));

    const result = await extendManualBooking({
      bookingId: created.data.bookingId,
      expectedCurrentEndMinute: 12 * 60,
      idempotencyKey: extendKey(),
    });
    expect(result.data.previousEndMinute).toBe(12 * 60);
    expect(result.data.newEndMinute).toBe(13 * 60);
    expect(result.data.extensionFeeMinor).toBe(100_000); // LKR 1,000
    expect(result.data.extensionCount).toBe(1);
    expect(result.data.extensionChargesMinor).toBe(100_000);
    // The original package price is preserved exactly, never touched.
    expect(result.data.totalAmountMinor).toBe(created.data.totalAmountMinor);
    expect(result.data.newTotalAmountMinor).toBe(created.data.totalAmountMinor + 100_000);

    const db = getFirestore();
    const bookingSnap = await db.collection(COLLECTIONS.bookings).doc(created.data.bookingId).get();
    const booking = bookingSnap.data();
    expect(booking?.endMinute).toBe(13 * 60);
    expect(booking?.totalAmountMinor).toBe(created.data.totalAmountMinor);
    expect(booking?.extensionCount).toBe(1);
    expect(booking?.extensionChargesMinor).toBe(100_000);
    // Same room, date, start time, capacity — untouched.
    expect(booking?.roomId).toBe(created.data.roomId);
    expect(booking?.startMinute).toBe(9 * 60);
    expect(booking?.peopleCount).toBe(2);
    // docs/DECISIONS.md D17 — created with the LKR 1,000 advance recorded,
    // so this is partially_paid immediately, never "unpaid"; extension
    // never touches amountPaidMinor or paymentStatus.
    expect(booking?.paymentStatus).toBe("partially_paid");
    expect(booking?.amountPaidMinor).toBe(created.data.amountPaidMinor);
    expect(result.data.amountPaidMinor).toBe(created.data.amountPaidMinor);
    expect(result.data.balanceDueMinor).toBe(result.data.newTotalAmountMinor - result.data.amountPaidMinor);

    const extensionsSnap = await db.collection(COLLECTIONS.bookings).doc(created.data.bookingId).collection("extensions").get();
    expect(extensionsSnap.docs).toHaveLength(1);
    const extensionDoc = extensionsSnap.docs[0]?.data();
    expect(extensionDoc?.approvedByUid).toBeTruthy();
    expect(extensionDoc?.feeMinor).toBe(100_000);
    expect(extensionDoc?.previousEndMinute).toBe(12 * 60);
    expect(extensionDoc?.newEndMinute).toBe(13 * 60);
  });

  it("owner extends a confirmed manual booking", async () => {
    await signInAs(OWNER_EMAIL);
    const dateISO = addDaysToColomboToday(241);
    const created = await createManualBooking(manualBooking(dateISO, "09:00", { packageId: "ac-large" }));

    const result = await extendManualBooking({
      bookingId: created.data.bookingId,
      expectedCurrentEndMinute: 12 * 60,
      idempotencyKey: extendKey(),
    });
    expect(result.data.newEndMinute).toBe(13 * 60);
  });

  it("writes exactly one manual_booking_extended audit entry with a before/after diff and no customer PII", async () => {
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(242);
    const created = await createManualBooking(manualBooking(dateISO, "09:00", { name: "Should Not Leak", phone: "0779998888" }));
    await extendManualBooking({ bookingId: created.data.bookingId, expectedCurrentEndMinute: 12 * 60, idempotencyKey: extendKey() });

    const db = getFirestore();
    const auditSnap = await db
      .collection(COLLECTIONS.auditLog)
      .where("targetId", "==", created.data.bookingId)
      .where("action", "==", "manual_booking_extended")
      .get();
    expect(auditSnap.docs).toHaveLength(1);
    const audit = auditSnap.docs[0]?.data();
    expect(audit?.before).toEqual({ endMinute: 12 * 60 });
    expect(audit?.after).toEqual({ endMinute: 13 * 60 });
    const serialized = JSON.stringify(audit);
    expect(serialized).not.toContain("Should Not Leak");
    expect(serialized).not.toContain("0779998888");
  });

  it("ignores a client-supplied fee/amount — the server always computes its own", async () => {
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(243);
    const created = await createManualBooking(manualBooking(dateISO, "09:00"));

    const result = await extendManualBooking({
      bookingId: created.data.bookingId,
      expectedCurrentEndMinute: 12 * 60,
      idempotencyKey: extendKey(),
      extensionFeeMinor: 1,
      newTotalAmountMinor: 1,
    } as ExtendRequest);
    expect(result.data.extensionFeeMinor).toBe(100_000);
    expect(result.data.newTotalAmountMinor).toBe(created.data.totalAmountMinor + 100_000);
  });
});

describe("public availability and the staff schedule reflect extensions", () => {
  it("a 09:00–13:00 reservation (after extension) blocks the 12:00–15:00 public slot", async () => {
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(244);
    // ac-small has exactly one room (room-4) — extending its 09:00 session
    // to 13:00 must make the 12:00 public slot unavailable, matching
    // docs/PROJECT_BRIEF.md's canonical example exactly.
    const created = await createManualBooking(manualBooking(dateISO, "09:00"));
    await extendManualBooking({ bookingId: created.data.bookingId, expectedCurrentEndMinute: 12 * 60, idempotencyKey: extendKey() });

    const result = await getAvailability({ packageId: "ac-small", dateISO });
    const noonSlot = result.data.slots.find((s) => s.time === "12:00");
    expect(noonSlot?.status).toBe("full");
    expect(noonSlot?.roomsFree).toBe(0);
  });
});

describe("ending exactly at 21:00 is allowed; any further extension is rejected", () => {
  it("three sequential extensions from a 15:00 start reach exactly 21:00; a fourth is rejected", async () => {
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(245);
    const created = await createManualBooking(manualBooking(dateISO, "15:00", { packageId: "ac-large" }));

    let currentEnd = 18 * 60; // 15:00 + 3h session = 18:00
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await extendManualBooking({
        bookingId: created.data.bookingId,
        expectedCurrentEndMinute: currentEnd,
        idempotencyKey: extendKey(),
      });
      currentEnd = result.data.newEndMinute;
    }
    expect(currentEnd).toBe(21 * 60); // exactly closing time — allowed

    await expect(
      extendManualBooking({ bookingId: created.data.bookingId, expectedCurrentEndMinute: currentEnd, idempotencyKey: extendKey() }),
    ).rejects.toMatchObject({ code: "functions/failed-precondition" });

    const db = getFirestore();
    const bookingSnap = await db.collection(COLLECTIONS.bookings).doc(created.data.bookingId).get();
    expect(bookingSnap.data()?.endMinute).toBe(21 * 60); // unchanged by the rejected 4th attempt
  });
});

describe("conflicts are rejected; expired holds are ignored", () => {
  it("rejects an extension that would overlap another confirmed reservation on the same room", async () => {
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(246);
    // ac-large has exactly one room (room-5) — a 09:00 booking and a 12:00
    // booking on it are adjacent but non-overlapping; extending the 09:00
    // booking into 12:00–13:00 must conflict with the 12:00 booking.
    const first = await createManualBooking(manualBooking(dateISO, "09:00", { packageId: "ac-large" }));
    await createManualBooking(manualBooking(dateISO, "12:00", { packageId: "ac-large" }));

    await expect(
      extendManualBooking({ bookingId: first.data.bookingId, expectedCurrentEndMinute: 12 * 60, idempotencyKey: extendKey() }),
    ).rejects.toMatchObject({ code: "functions/failed-precondition" });

    const db = getFirestore();
    const bookingSnap = await db.collection(COLLECTIONS.bookings).doc(first.data.bookingId).get();
    expect(bookingSnap.data()?.endMinute).toBe(12 * 60); // unchanged
  });

  it("rejects an extension that would overlap an active (unexpired) online hold on the same room", async () => {
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(247);
    const created = await createManualBooking(manualBooking(dateISO, "09:00", { packageId: "ac-large" }));
    await createHold(guestHold(dateISO, "12:00", { packageId: "ac-large" }));

    await expect(
      extendManualBooking({ bookingId: created.data.bookingId, expectedCurrentEndMinute: 12 * 60, idempotencyKey: extendKey() }),
    ).rejects.toMatchObject({ code: "functions/failed-precondition" });
  });

  it("an expired hold on the same room does not block the extension", async () => {
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(248);
    const created = await createManualBooking(manualBooking(dateISO, "09:00", { packageId: "ac-large" }));
    const hold = await createHold(guestHold(dateISO, "12:00", { packageId: "ac-large" }));

    const db = getFirestore();
    const inventoryRef = db.collection(COLLECTIONS.inventory).doc(inventoryDocId("room-5", dateISO));
    const snap = await inventoryRef.get();
    const intervals = (snap.data()?.intervals ?? []) as Array<Record<string, unknown>>;
    const patched = intervals.map((interval) =>
      interval.bookingId === hold.data.holdId ? { ...interval, holdExpiresAtMillis: Date.now() - 60_000 } : interval,
    );
    await inventoryRef.update({ intervals: patched });

    const result = await extendManualBooking({
      bookingId: created.data.bookingId,
      expectedCurrentEndMinute: 12 * 60,
      idempotencyKey: extendKey(),
    });
    expect(result.data.newEndMinute).toBe(13 * 60);
  });
});

describe("ineligible bookings are rejected", () => {
  it("rejects a booking that doesn't exist", async () => {
    await signInAs(STAFF_EMAIL);
    await expect(
      extendManualBooking({ bookingId: "does-not-exist-at-all", expectedCurrentEndMinute: 720, idempotencyKey: extendKey() }),
    ).rejects.toMatchObject({ code: "functions/not-found" });
  });

  it("rejects an already-cancelled booking", async () => {
    // Direct Firestore write bypassing the real create+cancel flow —
    // docs/DECISIONS.md D17 means a REAL createManualBooking-created
    // booking always carries a recorded advance and can no longer be
    // cancelled through cancelManualBooking (see cancelManualBooking's own
    // test file), so this sets up the "already cancelled" state directly,
    // purely to prove extension rejects it.
    const db = getFirestore();
    const dateISO = addDaysToColomboToday(249);
    const bookingRef = db.collection(COLLECTIONS.bookings).doc();
    await bookingRef.set({
      packageId: "ac-small",
      roomId: "room-4",
      dateISO,
      startMinute: 9 * 60,
      endMinute: 12 * 60,
      bookingStatus: "cancelled",
      paymentStatus: "unpaid",
      totalAmountMinor: 320000,
      currency: "LKR",
      peopleCount: 2,
      customerName: "Synthetic Already-Cancelled Test",
      customerPhone: "0770000004",
      customerEmail: "",
      referenceCode: "APX-SYNTHETIC-CANCELLED",
      source: "staff_walkin",
      createdBy: "synthetic-test-setup",
      staffNote: "",
      cancelledAtMillis: Date.now(),
      cancelledBy: "synthetic-test-setup",
      cancellationReason: "Synthetic setup",
      idempotencyKey: `synthetic-cancelled-${Math.random().toString(36).slice(2)}`,
      createdAt: new Date(),
    });

    await signInAs(STAFF_EMAIL);
    await expect(
      extendManualBooking({ bookingId: bookingRef.id, expectedCurrentEndMinute: 12 * 60, idempotencyKey: extendKey() }),
    ).rejects.toMatchObject({ code: "functions/failed-precondition" });
  });

  it("rejects an online hold/booking — this endpoint only ever extends a manual reservation", async () => {
    const dateISO = addDaysToColomboToday(250);
    const hold = await createHold(guestHold(dateISO, "09:00"));
    await signInAs(STAFF_EMAIL);
    await expect(
      extendManualBooking({ bookingId: hold.data.holdId, expectedCurrentEndMinute: 12 * 60, idempotencyKey: extendKey() }),
    ).rejects.toMatchObject({ code: "functions/failed-precondition" });
  });

  it("rejects a Party booking, even one that reached bookingStatus=confirmed by direct data manipulation", async () => {
    const db = getFirestore();
    const dateISO = addDaysToColomboToday(251);
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
      referenceCode: "APX-SYNTHETIC-EXT-PARTY",
      source: "staff_walkin",
      createdBy: "synthetic-test-setup",
      staffNote: "",
      idempotencyKey: `synthetic-party-ext-${Math.random().toString(36).slice(2)}`,
      createdAt: new Date(),
    });

    await signInAs(STAFF_EMAIL);
    await expect(
      extendManualBooking({ bookingId: bookingRef.id, expectedCurrentEndMinute: 12 * 60, idempotencyKey: extendKey() }),
    ).rejects.toMatchObject({ code: "functions/failed-precondition" });
  });

  it("rejects a booking whose paymentStatus is an online/PayHere state, even by direct data manipulation — defense-in-depth", async () => {
    // docs/DECISIONS.md D17 — unpaid, partially_paid, and paid are all
    // extendable; only a state that should never appear on a manual
    // booking at all (an online/PayHere payment state) is rejected.
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(252);
    const created = await createManualBooking(manualBooking(dateISO, "09:00"));

    const db = getFirestore();
    await db.collection(COLLECTIONS.bookings).doc(created.data.bookingId).update({ paymentStatus: "succeeded" });

    await expect(
      extendManualBooking({ bookingId: created.data.bookingId, expectedCurrentEndMinute: 12 * 60, idempotencyKey: extendKey() }),
    ).rejects.toMatchObject({ code: "functions/failed-precondition" });
  });

  it("extends a partially_paid booking (the normal case now) and a fully paid booking alike, growing the total/balance but never the amount paid", async () => {
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(260);
    const created = await createManualBooking(manualBooking(dateISO, "09:00"));
    expect(created.data.paymentStatus).toBe("partially_paid"); // the real, normal post-D17 state

    const partiallyPaidExtension = await extendManualBooking({
      bookingId: created.data.bookingId,
      expectedCurrentEndMinute: 12 * 60,
      idempotencyKey: extendKey(),
    });
    expect(partiallyPaidExtension.data.amountPaidMinor).toBe(created.data.amountPaidMinor); // unchanged
    expect(partiallyPaidExtension.data.balanceDueMinor).toBe(
      partiallyPaidExtension.data.newTotalAmountMinor - created.data.amountPaidMinor,
    );

    // Now mark it fully paid (direct data manipulation — no real "pay the
    // rest" call in this test file, that's recordManualBookingPayment's own
    // test file) and extend it again — still allowed.
    const db = getFirestore();
    await db.collection(COLLECTIONS.bookings).doc(created.data.bookingId).update({
      amountPaidMinor: partiallyPaidExtension.data.newTotalAmountMinor,
      paymentStatus: "paid",
    });
    const paidExtension = await extendManualBooking({
      bookingId: created.data.bookingId,
      expectedCurrentEndMinute: 13 * 60,
      idempotencyKey: extendKey(),
    });
    expect(paidExtension.data.newEndMinute).toBe(14 * 60);
    // The amount paid is untouched by extension even though the booking was
    // fully paid a moment ago — the new charge only grows the balance.
    expect(paidExtension.data.amountPaidMinor).toBe(partiallyPaidExtension.data.newTotalAmountMinor);
    expect(paidExtension.data.balanceDueMinor).toBe(100_000); // exactly this extension's own LKR 1,000 fee
  });

  it("allows extending a booking that is currently in progress (started but not yet ended)", async () => {
    // Direct Firestore write bypassing createManualBooking (which refuses a
    // past start time) to set up a booking that started earlier today but
    // has not ended yet — proves extension is allowed DURING a session, not
    // just before it (the opposite eligibility window from cancellation).
    // endMinute is anchored to the server's actual current minute (not a
    // fixed constant) so this test is correct regardless of what time of
    // day it happens to run: it must land strictly after "now" (booking
    // still in progress) with only a couple of minutes' buffer, so the
    // transaction's own read of "now" a moment later still sees it as
    // in-progress, not yet ended.
    const db = getFirestore();
    const dateISO = addDaysToColomboToday(0); // today
    const nowMinute = getColomboMinuteOfDay();
    const endMinute = nowMinute + 2;
    const bookingRef = db.collection(COLLECTIONS.bookings).doc();
    await bookingRef.set({
      packageId: "ac-small",
      roomId: "room-4",
      dateISO,
      startMinute: 0, // definitely already started
      endMinute,
      bookingStatus: "confirmed",
      paymentStatus: "unpaid",
      totalAmountMinor: 320000,
      currency: "LKR",
      peopleCount: 2,
      customerName: "Synthetic In-Progress Test",
      customerPhone: "0770000002",
      customerEmail: "",
      referenceCode: "APX-SYNTHETIC-INPROGRESS",
      source: "staff_walkin",
      createdBy: "synthetic-test-setup",
      staffNote: "",
      idempotencyKey: `synthetic-inprogress-${Math.random().toString(36).slice(2)}`,
      createdAt: new Date(),
    });
    const inventoryRef = db.collection(COLLECTIONS.inventory).doc(inventoryDocId("room-4", dateISO));
    await inventoryRef.set({
      roomId: "room-4",
      dateISO,
      intervals: [{ bookingId: bookingRef.id, startMinute: 0, endMinute, status: "confirmed", holdExpiresAtMillis: null }],
    });

    await signInAs(STAFF_EMAIL);
    if (endMinute + 60 <= 21 * 60) {
      // Comfortably before closing — the extension must succeed, proving
      // "in progress" is genuinely eligible, not just "not yet rejected."
      const result = await extendManualBooking({ bookingId: bookingRef.id, expectedCurrentEndMinute: endMinute, idempotencyKey: extendKey() });
      expect(result.data.newEndMinute).toBe(endMinute + 60);
    } else {
      // Only reachable if this test happens to run very late in the
      // Colombo evening — the extension is still rejected, but only for
      // the closing-time reason, never "already ended": proving it passed
      // the in-progress eligibility gate before hitting a different,
      // expected boundary.
      await expect(
        extendManualBooking({ bookingId: bookingRef.id, expectedCurrentEndMinute: endMinute, idempotencyKey: extendKey() }),
      ).rejects.toMatchObject({ code: "functions/failed-precondition", message: expect.stringContaining("closing time") });
    }
  });

  it("rejects a booking whose session has already ended", async () => {
    const db = getFirestore();
    const dateISO = addDaysToColomboToday(0); // today
    const bookingRef = db.collection(COLLECTIONS.bookings).doc();
    await bookingRef.set({
      packageId: "ac-small",
      roomId: "room-4",
      dateISO,
      startMinute: 0,
      endMinute: 1, // 00:01 — definitely already ended
      bookingStatus: "confirmed",
      paymentStatus: "unpaid",
      totalAmountMinor: 320000,
      currency: "LKR",
      peopleCount: 2,
      customerName: "Synthetic Ended Test",
      customerPhone: "0770000003",
      customerEmail: "",
      referenceCode: "APX-SYNTHETIC-ENDED",
      source: "staff_walkin",
      createdBy: "synthetic-test-setup",
      staffNote: "",
      idempotencyKey: `synthetic-ended-${Math.random().toString(36).slice(2)}`,
      createdAt: new Date(),
    });

    await signInAs(STAFF_EMAIL);
    await expect(
      extendManualBooking({ bookingId: bookingRef.id, expectedCurrentEndMinute: 1, idempotencyKey: extendKey() }),
    ).rejects.toMatchObject({ code: "functions/failed-precondition" });
  });
});

describe("retries and simultaneous extensions cannot double-apply", () => {
  it("an exact retry (same key, same expected end time) returns the original result unchanged — no second hour, no second charge", async () => {
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(253);
    const created = await createManualBooking(manualBooking(dateISO, "09:00"));
    const key = extendKey();

    const first = await extendManualBooking({ bookingId: created.data.bookingId, expectedCurrentEndMinute: 12 * 60, idempotencyKey: key });
    const second = await extendManualBooking({ bookingId: created.data.bookingId, expectedCurrentEndMinute: 12 * 60, idempotencyKey: key });

    expect(second.data.newEndMinute).toBe(first.data.newEndMinute);
    expect(second.data.extensionCount).toBe(1);

    const db = getFirestore();
    const bookingSnap = await db.collection(COLLECTIONS.bookings).doc(created.data.bookingId).get();
    expect(bookingSnap.data()?.endMinute).toBe(13 * 60); // still just +1 hour, not +2
    const extensionsSnap = await db.collection(COLLECTIONS.bookings).doc(created.data.bookingId).collection("extensions").get();
    expect(extensionsSnap.docs).toHaveLength(1);
    const auditSnap = await db
      .collection(COLLECTIONS.auditLog)
      .where("targetId", "==", created.data.bookingId)
      .where("action", "==", "manual_booking_extended")
      .get();
    expect(auditSnap.docs).toHaveLength(1);
  });

  it("reusing the same key with a DIFFERENT expected end time is rejected, not silently served", async () => {
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(254);
    const created = await createManualBooking(manualBooking(dateISO, "09:00"));
    const key = extendKey();
    await extendManualBooking({ bookingId: created.data.bookingId, expectedCurrentEndMinute: 12 * 60, idempotencyKey: key });

    await expect(
      extendManualBooking({ bookingId: created.data.bookingId, expectedCurrentEndMinute: 13 * 60, idempotencyKey: key }),
    ).rejects.toMatchObject({ code: "functions/already-exists" });
  });

  it("a true concurrent double-click (same key, same expected end time) still produces exactly one extension", async () => {
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(255);
    const created = await createManualBooking(manualBooking(dateISO, "09:00"));
    const key = extendKey();

    const results = await Promise.allSettled([
      extendManualBooking({ bookingId: created.data.bookingId, expectedCurrentEndMinute: 12 * 60, idempotencyKey: key }),
      extendManualBooking({ bookingId: created.data.bookingId, expectedCurrentEndMinute: 12 * 60, idempotencyKey: key }),
    ]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);

    const db = getFirestore();
    const bookingSnap = await db.collection(COLLECTIONS.bookings).doc(created.data.bookingId).get();
    expect(bookingSnap.data()?.endMinute).toBe(13 * 60);
    const extensionsSnap = await db.collection(COLLECTIONS.bookings).doc(created.data.bookingId).collection("extensions").get();
    expect(extensionsSnap.docs).toHaveLength(1);
  });

  it("a NEW key against a STALE expected end time is rejected as a conflict, without applying a second hour", async () => {
    // This is the exact bug this design guards against: staff clicks
    // Extend twice in a row without the UI refreshing in between — the
    // second click generates a fresh idempotency key (it looks like a
    // deliberate new action) but still carries the OLD end time. It must
    // be rejected, not silently stacked on top of the first extension.
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(256);
    const created = await createManualBooking(manualBooking(dateISO, "09:00"));

    await extendManualBooking({ bookingId: created.data.bookingId, expectedCurrentEndMinute: 12 * 60, idempotencyKey: extendKey() });

    await expect(
      extendManualBooking({ bookingId: created.data.bookingId, expectedCurrentEndMinute: 12 * 60, idempotencyKey: extendKey() }),
    ).rejects.toMatchObject({ code: "functions/aborted" });

    const db = getFirestore();
    const bookingSnap = await db.collection(COLLECTIONS.bookings).doc(created.data.bookingId).get();
    expect(bookingSnap.data()?.endMinute).toBe(13 * 60); // still just +1 hour
    const extensionsSnap = await db.collection(COLLECTIONS.bookings).doc(created.data.bookingId).collection("extensions").get();
    expect(extensionsSnap.docs).toHaveLength(1);
  });

  it("an intentional further extension, using the updated end time and a new key, succeeds", async () => {
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(257);
    const created = await createManualBooking(manualBooking(dateISO, "09:00"));

    const first = await extendManualBooking({ bookingId: created.data.bookingId, expectedCurrentEndMinute: 12 * 60, idempotencyKey: extendKey() });
    const second = await extendManualBooking({
      bookingId: created.data.bookingId,
      expectedCurrentEndMinute: first.data.newEndMinute,
      idempotencyKey: extendKey(),
    });

    expect(second.data.newEndMinute).toBe(14 * 60);
    expect(second.data.extensionCount).toBe(2);
    expect(second.data.extensionChargesMinor).toBe(200_000);

    const db = getFirestore();
    const bookingSnap = await db.collection(COLLECTIONS.bookings).doc(created.data.bookingId).get();
    expect(bookingSnap.data()?.endMinute).toBe(14 * 60);
    const extensionsSnap = await db.collection(COLLECTIONS.bookings).doc(created.data.bookingId).collection("extensions").get();
    expect(extensionsSnap.docs).toHaveLength(2);
  });
});

describe("extension racing with another booking cannot double-book", () => {
  it("true concurrent race for the newly-claimed hour: exactly one of {extension, a new hold for that slot} succeeds", async () => {
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(258);
    // ac-small has exactly one room (room-4) — the 09:00 booking's
    // extension into 12:00–13:00 races a guest hold for the 12:00 public
    // slot on the same room.
    const created = await createManualBooking(manualBooking(dateISO, "09:00"));

    const results = await Promise.allSettled([
      extendManualBooking({ bookingId: created.data.bookingId, expectedCurrentEndMinute: 12 * 60, idempotencyKey: extendKey() }),
      createHold(guestHold(dateISO, "12:00")),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // Whichever won, the room's 12:00 public slot is now fully occupied —
    // never both winning, never neither.
    const availability = await getAvailability({ packageId: "ac-small", dateISO });
    const noonSlot = availability.data.slots.find((s) => s.time === "12:00");
    expect(noonSlot?.status).toBe("full");
  });
});

describe("cancellation releases the entire extended interval", () => {
  it("cancelling an extended booking frees the full extended range, not just the original range", async () => {
    // Built as a legacy-unpaid booking (direct Firestore write, matching
    // this file's other synthetic-state tests) rather than via the real
    // createManualBooking — docs/DECISIONS.md D17 means a REAL created
    // booking always carries a recorded advance and can no longer reach
    // cancelManualBooking successfully (see cancelManualBooking's own test
    // file for that behavior); this test is specifically about extension +
    // cancellation composing correctly on a booking that CAN be cancelled.
    const db = getFirestore();
    const dateISO = addDaysToColomboToday(259);
    const bookingRef = db.collection(COLLECTIONS.bookings).doc();
    await bookingRef.set({
      packageId: "ac-large",
      roomId: "room-5",
      dateISO,
      startMinute: 9 * 60,
      endMinute: 12 * 60,
      bookingStatus: "confirmed",
      paymentStatus: "unpaid",
      totalAmountMinor: 450000,
      currency: "LKR",
      peopleCount: 2,
      customerName: "Legacy Extend-Then-Cancel Test",
      customerPhone: "0770000005",
      customerEmail: "",
      referenceCode: "APX-SYNTHETIC-EXTENDCANCEL",
      source: "staff_walkin",
      createdBy: "synthetic-test-setup",
      staffNote: "",
      idempotencyKey: `synthetic-extendcancel-${Math.random().toString(36).slice(2)}`,
      createdAt: new Date(),
    });
    const inventoryRef = db.collection(COLLECTIONS.inventory).doc(inventoryDocId("room-5", dateISO));
    await inventoryRef.set({
      roomId: "room-5",
      dateISO,
      intervals: [{ bookingId: bookingRef.id, startMinute: 9 * 60, endMinute: 12 * 60, status: "confirmed", holdExpiresAtMillis: null }],
    });

    await signInAs(STAFF_EMAIL);
    await extendManualBooking({ bookingId: bookingRef.id, expectedCurrentEndMinute: 12 * 60, idempotencyKey: extendKey() });
    await cancelManualBooking({ bookingId: bookingRef.id, reason: "Freeing the full extended slot" });

    const invSnap = await inventoryRef.get();
    const intervals = (invSnap.data()?.intervals ?? []) as Array<Record<string, unknown>>;
    const released = intervals.find((i) => i.bookingId === bookingRef.id);
    expect(released?.status).toBe("cancelled");
    expect(released?.endMinute).toBe(13 * 60); // the EXTENDED end time, not the original 12:00

    // A brand-new manual booking can now be made for the 12:00 slot
    // (inside the previously-extended range) — proving the release
    // actually covers the full extended interval, not just [09:00, 12:00).
    const rebooked = await createManualBooking(manualBooking(dateISO, "12:00", { packageId: "ac-large" }));
    expect(rebooked.data.roomId).toBe("room-5");
  });
});
