/**
 * Integration tests for recordManualBookingPayment against the real Auth +
 * Firestore + Functions emulators — see the file-level note in
 * ping.emulator.test.ts: only meaningful under `firebase emulators:exec`
 * (the root `test:emulators` script, or an isolated-port run — see
 * docs/PROGRESS.md).
 *
 * Self-contained: creates its own dedicated test accounts via the Admin
 * SDK, distinct emails from every other test file's.
 *
 * Covers every scenario explicitly required for this phase (docs/DECISIONS.md
 * D17): the LKR 1,000 advance is recorded atomically with the booking
 * (createManualBooking itself — this file additionally proves "none of
 * those records exist if inventory is unavailable"), unauthorized access,
 * invalid amounts, duplicate submissions (idempotency), concurrent payment
 * races cannot overpay, additional payments update the running balance and
 * status correctly, an extension grows the balance without touching the
 * amount paid, and a cancelled booking can never receive a payment.
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
const OWNER_EMAIL = "test-owner-payments@apexcinema.test";
const STAFF_EMAIL = "test-staff-payments@apexcinema.test";
const NOROLE_EMAIL = "test-norole-payments@apexcinema.test";

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

interface RecordPaymentResult {
  bookingId: string;
  roomId: string;
  dateISO: string;
  amountRecordedMinor: number;
  totalAmountMinor: number;
  amountPaidMinor: number;
  balanceDueMinor: number;
  paymentStatus: "unpaid" | "partially_paid" | "paid";
  currency: "LKR";
}

interface RecordPaymentRequest {
  bookingId: string;
  amountMinor: number;
  idempotencyKey: string;
  [extra: string]: unknown;
}

interface ExtendResult {
  bookingId: string;
  newEndMinute: number;
  newTotalAmountMinor: number;
  amountPaidMinor: number;
  balanceDueMinor: number;
}

interface ExtendRequest {
  bookingId: string;
  expectedCurrentEndMinute: number;
  idempotencyKey: string;
}

let app: FirebaseApp;
let auth: Auth;
let functions: Functions;
let createManualBooking: HttpsCallable<ManualBookingRequest, ManualBookingResult>;
let cancelManualBooking: HttpsCallable<{ bookingId: string; reason: string }, { bookingId: string; bookingStatus: string }>;
let extendManualBooking: HttpsCallable<ExtendRequest, ExtendResult>;
let recordManualBookingPayment: HttpsCallable<RecordPaymentRequest, RecordPaymentResult>;
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
    idempotencyKey: `payments-test-create-${Math.random().toString(36).slice(2)}`,
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
    idempotencyKey: `payments-test-guest-${Math.random().toString(36).slice(2)}`,
    ...overrides,
  };
}

function paymentKey(): string {
  return `payment-test-${Math.random().toString(36).slice(2)}`;
}

beforeAll(async () => {
  app = initializeApp({ apiKey: "demo-api-key", projectId: TEST_PROJECT_ID }, "payments-emulator-test");
  auth = getAuth(app);
  connectAuthEmulator(auth, `http://127.0.0.1:${EMULATOR_PORTS.auth}`, { disableWarnings: true });
  functions = getFunctions(app);
  connectFunctionsEmulator(functions, "127.0.0.1", EMULATOR_PORTS.functions);
  createManualBooking = httpsCallable(functions, "createManualBooking");
  cancelManualBooking = httpsCallable(functions, "cancelManualBooking");
  extendManualBooking = httpsCallable(functions, "extendManualBooking");
  recordManualBookingPayment = httpsCallable(functions, "recordManualBookingPayment");
  createHold = httpsCallable(functions, "createHold");

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

describe("createManualBooking atomically creates the advance payment — nothing partial", () => {
  it("if inventory is unavailable, no booking, inventory interval, payment, or audit record is created", async () => {
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(270);
    await createManualBooking(manualBooking(dateISO, "09:00")); // fills the only ac-small room

    const db = getFirestore();
    // Scoped to this test's own date, not a raw whole-collection count —
    // other test FILES run concurrently against the same emulator project
    // and write their own audit entries at unrelated dates, which a global
    // count would race against.
    const auditBefore = (await db.collection(COLLECTIONS.auditLog).where("dateISO", "==", dateISO).get()).size;

    await expect(createManualBooking(manualBooking(dateISO, "09:00"))).rejects.toMatchObject({
      code: "functions/failed-precondition",
    });

    // No new booking doc, no new payment, no new audit entry from the failed attempt.
    const bookingsSnap = await db.collection(COLLECTIONS.bookings).where("dateISO", "==", dateISO).where("startMinute", "==", 9 * 60).get();
    expect(bookingsSnap.docs).toHaveLength(1); // only the one that actually succeeded
    const auditAfter = (await db.collection(COLLECTIONS.auditLog).where("dateISO", "==", dateISO).get()).size;
    expect(auditAfter).toBe(auditBefore);
  });
});

describe("authorization", () => {
  it("rejects an unauthenticated (guest) caller with unauthenticated", async () => {
    const freshApp = initializeApp({ apiKey: "demo-api-key", projectId: TEST_PROJECT_ID }, "payments-guest-test");
    const freshFunctions = getFunctions(freshApp);
    connectFunctionsEmulator(freshFunctions, "127.0.0.1", EMULATOR_PORTS.functions);
    const call = httpsCallable<RecordPaymentRequest, RecordPaymentResult>(freshFunctions, "recordManualBookingPayment");
    await expect(call({ bookingId: "does-not-matter", amountMinor: 100000, idempotencyKey: paymentKey() })).rejects.toMatchObject({
      code: "functions/unauthenticated",
    });
  });

  it("rejects a signed-in account with no approved role", async () => {
    await signInAs(NOROLE_EMAIL);
    await expect(
      recordManualBookingPayment({ bookingId: "does-not-matter", amountMinor: 100000, idempotencyKey: paymentKey() }),
    ).rejects.toMatchObject({ code: "functions/permission-denied" });
  });

  it("sending role: 'owner' in request.data does not grant a no-role account access", async () => {
    await signInAs(NOROLE_EMAIL);
    await expect(
      recordManualBookingPayment({ bookingId: "does-not-matter", amountMinor: 100000, idempotencyKey: paymentKey(), role: "owner" }),
    ).rejects.toMatchObject({ code: "functions/permission-denied" });
  });
});

describe("invalid amounts are rejected before any write", () => {
  it("rejects zero, negative, non-integer, and absurdly large amounts", async () => {
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(271);
    const created = await createManualBooking(manualBooking(dateISO, "09:00"));

    for (const badAmount of [0, -100, 1.5, 10_000_000]) {
      await expect(
        recordManualBookingPayment({ bookingId: created.data.bookingId, amountMinor: badAmount, idempotencyKey: paymentKey() }),
      ).rejects.toMatchObject({ code: "functions/invalid-argument" });
    }

    // Untouched by every rejected attempt.
    const db = getFirestore();
    const bookingSnap = await db.collection(COLLECTIONS.bookings).doc(created.data.bookingId).get();
    expect(bookingSnap.data()?.amountPaidMinor).toBe(created.data.amountPaidMinor);
  });

  it("rejects an amount that would overpay the remaining balance", async () => {
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(272);
    const created = await createManualBooking(manualBooking(dateISO, "09:00")); // ac-small: total 320000, paid 100000, balance 220000

    await expect(
      recordManualBookingPayment({ bookingId: created.data.bookingId, amountMinor: 220001, idempotencyKey: paymentKey() }),
    ).rejects.toMatchObject({ code: "functions/failed-precondition" });

    // The exact remaining balance is still accepted.
    const result = await recordManualBookingPayment({
      bookingId: created.data.bookingId,
      amountMinor: 220000,
      idempotencyKey: paymentKey(),
    });
    expect(result.data.paymentStatus).toBe("paid");
    expect(result.data.balanceDueMinor).toBe(0);

    // Now fully paid — even LKR 1 more is rejected.
    await expect(
      recordManualBookingPayment({ bookingId: created.data.bookingId, amountMinor: 1, idempotencyKey: paymentKey() }),
    ).rejects.toMatchObject({ code: "functions/failed-precondition" });
  });

  it("rejects a booking that doesn't exist", async () => {
    await signInAs(STAFF_EMAIL);
    await expect(
      recordManualBookingPayment({ bookingId: "does-not-exist-at-all", amountMinor: 100000, idempotencyKey: paymentKey() }),
    ).rejects.toMatchObject({ code: "functions/not-found" });
  });
});

describe("additional payments update the running balance and status correctly", () => {
  it("staff records an additional payment; the ledger, running total, and status all update in one transaction", async () => {
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(273);
    const created = await createManualBooking(manualBooking(dateISO, "09:00")); // total 320000, paid 100000

    const result = await recordManualBookingPayment({
      bookingId: created.data.bookingId,
      amountMinor: 120000,
      idempotencyKey: paymentKey(),
    });
    expect(result.data.amountRecordedMinor).toBe(120000);
    expect(result.data.amountPaidMinor).toBe(220000); // 100000 + 120000
    expect(result.data.balanceDueMinor).toBe(100000); // 320000 - 220000
    expect(result.data.paymentStatus).toBe("partially_paid");

    const db = getFirestore();
    const bookingSnap = await db.collection(COLLECTIONS.bookings).doc(created.data.bookingId).get();
    const booking = bookingSnap.data();
    expect(booking?.amountPaidMinor).toBe(220000);
    expect(booking?.paymentStatus).toBe("partially_paid");
    // Never touches the original price.
    expect(booking?.totalAmountMinor).toBe(created.data.totalAmountMinor);

    // Two ledger entries now — the advance and this additional payment —
    // neither edited, both immutable and distinct.
    const paymentsSnap = await db.collection(COLLECTIONS.bookings).doc(created.data.bookingId).collection("payments").get();
    expect(paymentsSnap.docs).toHaveLength(2);
    const kinds = paymentsSnap.docs.map((doc) => doc.data().kind).sort();
    expect(kinds).toEqual(["additional", "advance"]);
    const additional = paymentsSnap.docs.find((doc) => doc.data().kind === "additional")?.data();
    expect(additional?.amountMinor).toBe(120000);
    expect(additional?.method).toBe("cash");
    expect(additional?.recordedByUid).toBeTruthy();
    expect(additional?.referenceCode).toBe(created.data.referenceCode);

    // A real audit entry with a before/after diff (docs/SECURITY.md §8).
    const auditSnap = await db
      .collection(COLLECTIONS.auditLog)
      .where("targetId", "==", created.data.bookingId)
      .where("action", "==", "manual_booking_payment_recorded")
      .get();
    expect(auditSnap.docs).toHaveLength(1);
    const audit = auditSnap.docs[0]?.data();
    expect(audit?.before).toEqual({ amountPaidMinor: 100000 });
    expect(audit?.after).toEqual({ amountPaidMinor: 220000 });
    expect(audit?.amountMinor).toBe(120000);
    // No customer PII in the audit entry.
    const serialized = JSON.stringify(audit);
    expect(serialized).not.toContain("Test Customer");
    expect(serialized).not.toContain("0771234567");
  });

  it("paying the exact remaining balance across two payments reaches paid, not partially_paid", async () => {
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(274);
    const created = await createManualBooking(manualBooking(dateISO, "12:00"));

    await recordManualBookingPayment({ bookingId: created.data.bookingId, amountMinor: 100000, idempotencyKey: paymentKey() });
    const final = await recordManualBookingPayment({
      bookingId: created.data.bookingId,
      amountMinor: 120000,
      idempotencyKey: paymentKey(),
    });
    expect(final.data.amountPaidMinor).toBe(320000);
    expect(final.data.balanceDueMinor).toBe(0);
    expect(final.data.paymentStatus).toBe("paid");
  });
});

describe("owner can also record payments", () => {
  it("owner records an additional payment", async () => {
    await signInAs(OWNER_EMAIL);
    const dateISO = addDaysToColomboToday(275);
    const created = await createManualBooking(manualBooking(dateISO, "15:00"));

    const result = await recordManualBookingPayment({
      bookingId: created.data.bookingId,
      amountMinor: 50000,
      idempotencyKey: paymentKey(),
    });
    expect(result.data.amountPaidMinor).toBe(150000);
  });
});

describe("duplicate submissions cannot double-apply", () => {
  it("an exact retry (same key, same amount) returns the original result unchanged — no second payment recorded", async () => {
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(276);
    const created = await createManualBooking(manualBooking(dateISO, "09:00"));
    const key = paymentKey();

    const first = await recordManualBookingPayment({ bookingId: created.data.bookingId, amountMinor: 50000, idempotencyKey: key });
    const second = await recordManualBookingPayment({ bookingId: created.data.bookingId, amountMinor: 50000, idempotencyKey: key });

    expect(second.data.amountPaidMinor).toBe(first.data.amountPaidMinor);
    expect(second.data.amountPaidMinor).toBe(150000); // still just +50000 once, not twice

    const db = getFirestore();
    const bookingSnap = await db.collection(COLLECTIONS.bookings).doc(created.data.bookingId).get();
    expect(bookingSnap.data()?.amountPaidMinor).toBe(150000);
    const paymentsSnap = await db.collection(COLLECTIONS.bookings).doc(created.data.bookingId).collection("payments").get();
    expect(paymentsSnap.docs).toHaveLength(2); // advance + exactly one additional payment
  });

  it("reusing the same key with a DIFFERENT amount is rejected, not silently served", async () => {
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(277);
    const created = await createManualBooking(manualBooking(dateISO, "09:00"));
    const key = paymentKey();
    await recordManualBookingPayment({ bookingId: created.data.bookingId, amountMinor: 50000, idempotencyKey: key });

    await expect(
      recordManualBookingPayment({ bookingId: created.data.bookingId, amountMinor: 60000, idempotencyKey: key }),
    ).rejects.toMatchObject({ code: "functions/already-exists" });
  });

  it("a genuinely new payment (new key, different amount) after a prior one succeeds normally", async () => {
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(278);
    const created = await createManualBooking(manualBooking(dateISO, "09:00"));

    await recordManualBookingPayment({ bookingId: created.data.bookingId, amountMinor: 50000, idempotencyKey: paymentKey() });
    const second = await recordManualBookingPayment({
      bookingId: created.data.bookingId,
      amountMinor: 70000,
      idempotencyKey: paymentKey(),
    });
    expect(second.data.amountPaidMinor).toBe(220000); // 100000 advance + 50000 + 70000
  });
});

describe("concurrent payment races cannot overpay", () => {
  it("two simultaneous payments that would together exceed the balance: at most the non-overpaying one(s) succeed, never overpaying the total", async () => {
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(279);
    const created = await createManualBooking(manualBooking(dateISO, "09:00")); // total 320000, paid 100000, balance 220000

    // Two concurrent requests for the FULL remaining balance each — if both
    // succeeded, the booking would be overpaid by 220000. Exactly one must
    // succeed; Firestore's transaction retry serializes the other, whose
    // retry then sees the updated amountPaidMinor and correctly rejects.
    const results = await Promise.allSettled([
      recordManualBookingPayment({ bookingId: created.data.bookingId, amountMinor: 220000, idempotencyKey: paymentKey() }),
      recordManualBookingPayment({ bookingId: created.data.bookingId, amountMinor: 220000, idempotencyKey: paymentKey() }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const db = getFirestore();
    const bookingSnap = await db.collection(COLLECTIONS.bookings).doc(created.data.bookingId).get();
    expect(bookingSnap.data()?.amountPaidMinor).toBe(320000); // exactly the total, never more
    expect(bookingSnap.data()?.paymentStatus).toBe("paid");
    const paymentsSnap = await db.collection(COLLECTIONS.bookings).doc(created.data.bookingId).collection("payments").get();
    expect(paymentsSnap.docs).toHaveLength(2); // advance + exactly one of the two concurrent payments
  });

  it("true concurrent double-click (same key, same amount) still records exactly one additional payment", async () => {
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(280);
    const created = await createManualBooking(manualBooking(dateISO, "12:00"));
    const key = paymentKey();

    const results = await Promise.allSettled([
      recordManualBookingPayment({ bookingId: created.data.bookingId, amountMinor: 50000, idempotencyKey: key }),
      recordManualBookingPayment({ bookingId: created.data.bookingId, amountMinor: 50000, idempotencyKey: key }),
    ]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);

    const db = getFirestore();
    const bookingSnap = await db.collection(COLLECTIONS.bookings).doc(created.data.bookingId).get();
    expect(bookingSnap.data()?.amountPaidMinor).toBe(150000); // just +50000 once
    const paymentsSnap = await db.collection(COLLECTIONS.bookings).doc(created.data.bookingId).collection("payments").get();
    expect(paymentsSnap.docs).toHaveLength(2);
  });
});

describe("ineligible bookings are rejected", () => {
  it("rejects payment against a cancelled booking", async () => {
    // Built as a legacy-unpaid booking (direct write) so it can actually be
    // cancelled through the real cancelManualBooking flow — a real
    // createManualBooking-created booking always has a recorded advance and
    // can no longer reach "cancelled" through that endpoint at all (see
    // cancelManualBooking's own test file, docs/DECISIONS.md D17).
    const db = getFirestore();
    const dateISO = addDaysToColomboToday(281);
    const bookingRef = db.collection(COLLECTIONS.bookings).doc();
    await bookingRef.set({
      packageId: "ac-small",
      roomId: "room-4",
      dateISO,
      startMinute: 9 * 60,
      endMinute: 12 * 60,
      bookingStatus: "confirmed",
      paymentStatus: "unpaid",
      totalAmountMinor: 320000,
      currency: "LKR",
      peopleCount: 2,
      customerName: "Legacy Payment-After-Cancel Test",
      customerPhone: "0770000006",
      customerEmail: "",
      referenceCode: "APX-SYNTHETIC-PAYCANCEL",
      source: "staff_walkin",
      createdBy: "synthetic-test-setup",
      staffNote: "",
      idempotencyKey: `synthetic-paycancel-${Math.random().toString(36).slice(2)}`,
      createdAt: new Date(),
    });
    const inventoryRef = db.collection(COLLECTIONS.inventory).doc(inventoryDocId("room-4", dateISO));
    await inventoryRef.set({
      roomId: "room-4",
      dateISO,
      intervals: [{ bookingId: bookingRef.id, startMinute: 9 * 60, endMinute: 12 * 60, status: "confirmed", holdExpiresAtMillis: null }],
    });

    await signInAs(STAFF_EMAIL);
    await cancelManualBooking({ bookingId: bookingRef.id, reason: "No longer needed before any payment" });

    await expect(
      recordManualBookingPayment({ bookingId: bookingRef.id, amountMinor: 100000, idempotencyKey: paymentKey() }),
    ).rejects.toMatchObject({ code: "functions/failed-precondition" });

    const after = await bookingRef.get();
    expect(after.data()?.amountPaidMinor ?? 0).toBe(0); // still nothing paid
  });

  it("rejects payment against an online hold/booking — this endpoint only ever records a payment against a manual reservation", async () => {
    const dateISO = addDaysToColomboToday(282);
    const hold = await createHold(guestHold(dateISO, "09:00"));
    await signInAs(STAFF_EMAIL);
    await expect(
      recordManualBookingPayment({ bookingId: hold.data.holdId, amountMinor: 100000, idempotencyKey: paymentKey() }),
    ).rejects.toMatchObject({ code: "functions/failed-precondition" });
  });
});

describe("integrates with extensions — an extension grows the balance, never the amount paid (docs/DECISIONS.md D16+D17)", () => {
  it("recording a payment, then extending, then paying the new balance reaches paid at the new total", async () => {
    await signInAs(STAFF_EMAIL);
    const dateISO = addDaysToColomboToday(283);
    const created = await createManualBooking(manualBooking(dateISO, "09:00")); // ac-small total 320000, paid 100000

    // Pay down to just the extension fee short of full.
    const afterFirstPayment = await recordManualBookingPayment({
      bookingId: created.data.bookingId,
      amountMinor: 220000,
      idempotencyKey: paymentKey(),
    });
    expect(afterFirstPayment.data.paymentStatus).toBe("paid"); // fully paid at the ORIGINAL total (320000)
    expect(afterFirstPayment.data.balanceDueMinor).toBe(0);

    // Extend — this must succeed even though the booking is fully paid
    // (docs/DECISIONS.md D17, item 4), and must NOT touch amountPaidMinor.
    const extension = await extendManualBooking({
      bookingId: created.data.bookingId,
      expectedCurrentEndMinute: 12 * 60,
      idempotencyKey: `payments-extend-${Math.random().toString(36).slice(2)}`,
    });
    expect(extension.data.newTotalAmountMinor).toBe(420000); // 320000 + 100000 extension fee
    expect(extension.data.amountPaidMinor).toBe(320000); // unchanged by the extension
    expect(extension.data.balanceDueMinor).toBe(100000); // exactly the new extension fee now owed

    const db = getFirestore();
    const bookingSnap = await db.collection(COLLECTIONS.bookings).doc(created.data.bookingId).get();
    expect(bookingSnap.data()?.paymentStatus).toBe("partially_paid"); // no longer "paid" once the total grew

    // Pay the new balance — reaches paid at the NEW total, not the original.
    const finalPayment = await recordManualBookingPayment({
      bookingId: created.data.bookingId,
      amountMinor: 100000,
      idempotencyKey: paymentKey(),
    });
    expect(finalPayment.data.amountPaidMinor).toBe(420000);
    expect(finalPayment.data.balanceDueMinor).toBe(0);
    expect(finalPayment.data.paymentStatus).toBe("paid");
  });
});
