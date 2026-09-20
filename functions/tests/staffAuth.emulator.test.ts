/**
 * Integration tests against the real Auth + Firestore + Functions emulators
 * — see the file-level note in ping.emulator.test.ts: only meaningful under
 * `firebase emulators:exec` (the root `test:emulators` script).
 *
 * Self-contained: creates its own dedicated test accounts via the Admin SDK
 * rather than depending on `seed:auth` having run first, so this file also
 * works run in isolation.
 *
 * Covers every scenario explicitly required for this phase: unauthenticated
 * rejection, no-role rejection, staff cannot reach the owner-only endpoint,
 * owner can reach both, role spoofing via request.data has no effect,
 * logout revokes access, and a hold never displays as confirmed.
 */
import { type Auth, type FirebaseApp } from "firebase/app";
import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import type { Functions, HttpsCallable } from "firebase/functions";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { addDaysToColomboToday } from "@apex-cinema/booking-core";
import { getApps, initializeApp as initAdminApp } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { beforeAll, describe, expect, it } from "vitest";
import type { CreateHoldResult } from "../src/lib/inventory";
import { COLLECTIONS } from "../src/lib/firestore";
import { EMULATOR_PORTS, TEST_PROJECT_ID } from "./testEmulatorPorts";

const PASSWORD = "TestPass!12345";
const OWNER_EMAIL = "test-owner-authspec@apexcinema.test";
const STAFF_EMAIL = "test-staff-authspec@apexcinema.test";
const NOROLE_EMAIL = "test-norole-authspec@apexcinema.test";

interface ScheduleBookingResponse {
  bookingId: string;
  displayStatus: "active-hold" | "expired-hold" | "confirmed" | "other";
}
interface ScheduleResponse {
  dateISO: string;
  bookings: readonly ScheduleBookingResponse[];
}
interface OverviewResponse {
  dateISO: string;
  counts: { total: number; activeHolds: number; expiredHolds: number; confirmed: number };
}

let app: FirebaseApp;
let auth: Auth;
let functions: Functions;
let getStaffSchedule: HttpsCallable<{ dateISO: string }, ScheduleResponse>;
let getOwnerOverview: HttpsCallable<{ dateISO: string }, OverviewResponse>;
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
  // Force a fresh ID token so recently (re)set custom claims are reflected —
  // the emulator otherwise may hand back a cached token from a prior session.
  await auth.currentUser?.getIdToken(true);
}

beforeAll(async () => {
  // The Auth SDK (unlike Firestore/Functions) requires a non-empty apiKey in
  // the app config before it will even talk to the emulator — a dummy value
  // is fine since the emulator never validates it against a real project.
  app = initializeApp({ apiKey: "demo-api-key", projectId: TEST_PROJECT_ID }, "staff-auth-emulator-test");
  auth = getAuth(app);
  connectAuthEmulator(auth, `http://127.0.0.1:${EMULATOR_PORTS.auth}`, { disableWarnings: true });
  functions = getFunctions(app);
  connectFunctionsEmulator(functions, "127.0.0.1", EMULATOR_PORTS.functions);
  getStaffSchedule = httpsCallable(functions, "getStaffSchedule");
  getOwnerOverview = httpsCallable(functions, "getOwnerOverview");
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

describe("unauthenticated callers are denied", () => {
  it("getStaffSchedule rejects with unauthenticated", async () => {
    await signOut(auth);
    await expect(getStaffSchedule({ dateISO: addDaysToColomboToday(160) })).rejects.toMatchObject({
      code: "functions/unauthenticated",
    });
  });

  it("getOwnerOverview rejects with unauthenticated", async () => {
    await signOut(auth);
    await expect(getOwnerOverview({ dateISO: addDaysToColomboToday(160) })).rejects.toMatchObject({
      code: "functions/unauthenticated",
    });
  });
});

describe("a signed-in account with no approved role is denied", () => {
  it("getStaffSchedule rejects with permission-denied", async () => {
    await signInAs(NOROLE_EMAIL);
    await expect(getStaffSchedule({ dateISO: addDaysToColomboToday(160) })).rejects.toMatchObject({
      code: "functions/permission-denied",
    });
  });

  it("getOwnerOverview rejects with permission-denied", async () => {
    await signInAs(NOROLE_EMAIL);
    await expect(getOwnerOverview({ dateISO: addDaysToColomboToday(160) })).rejects.toMatchObject({
      code: "functions/permission-denied",
    });
  });
});

describe("staff role", () => {
  it("can call getStaffSchedule", async () => {
    await signInAs(STAFF_EMAIL);
    const result = await getStaffSchedule({ dateISO: addDaysToColomboToday(160) });
    expect(result.data.dateISO).toBe(addDaysToColomboToday(160));
    expect(Array.isArray(result.data.bookings)).toBe(true);
  });

  it("cannot call the owner-only getOwnerOverview (permission-denied)", async () => {
    await signInAs(STAFF_EMAIL);
    await expect(getOwnerOverview({ dateISO: addDaysToColomboToday(160) })).rejects.toMatchObject({
      code: "functions/permission-denied",
    });
  });

  it("sending role: 'owner' in request.data does not grant owner access (role only ever comes from the token)", async () => {
    await signInAs(STAFF_EMAIL);
    await expect(
      getOwnerOverview({ dateISO: addDaysToColomboToday(160), role: "owner" } as unknown as { dateISO: string }),
    ).rejects.toMatchObject({ code: "functions/permission-denied" });
  });
});

describe("owner role", () => {
  it("can call getStaffSchedule", async () => {
    await signInAs(OWNER_EMAIL);
    const result = await getStaffSchedule({ dateISO: addDaysToColomboToday(161) });
    expect(result.data.dateISO).toBe(addDaysToColomboToday(161));
  });

  it("can call getOwnerOverview", async () => {
    await signInAs(OWNER_EMAIL);
    const result = await getOwnerOverview({ dateISO: addDaysToColomboToday(161) });
    expect(result.data.counts).toHaveProperty("total");
    expect(result.data.counts).toHaveProperty("activeHolds");
    expect(result.data.counts).toHaveProperty("expiredHolds");
    expect(result.data.counts).toHaveProperty("confirmed");
  });
});

describe("logout revokes access", () => {
  it("a call made after signOut() is rejected the same as never having signed in", async () => {
    await signInAs(STAFF_EMAIL);
    await getStaffSchedule({ dateISO: addDaysToColomboToday(160) }); // sanity: works while signed in
    await signOut(auth);
    await expect(getStaffSchedule({ dateISO: addDaysToColomboToday(160) })).rejects.toMatchObject({
      code: "functions/unauthenticated",
    });
  });
});

describe("holds and confirmed bookings are never conflated in the staff schedule", () => {
  it("an active hold displays as active-hold, not confirmed", async () => {
    const dateISO = addDaysToColomboToday(170);
    const created = await createHold({
      packageId: "ac-small",
      dateISO,
      time: "09:00",
      peopleCount: 2,
      name: "Staff Test Active Hold",
      phone: "0770000001",
      email: "active-hold-staff-test@example.com",
      idempotencyKey: `staff-test-active-${Math.random().toString(36).slice(2)}`,
    });

    await signInAs(STAFF_EMAIL);
    const result = await getStaffSchedule({ dateISO });
    const found = result.data.bookings.find((b) => b.bookingId === created.data.holdId);
    expect(found?.displayStatus).toBe("active-hold");
  });

  it("a hold whose expiry has passed displays as expired-hold, never confirmed", async () => {
    const dateISO = addDaysToColomboToday(171);
    const created = await createHold({
      packageId: "ac-small",
      dateISO,
      time: "09:00",
      peopleCount: 2,
      name: "Staff Test Expired Hold",
      phone: "0770000002",
      email: "expired-hold-staff-test@example.com",
      idempotencyKey: `staff-test-expired-${Math.random().toString(36).slice(2)}`,
    });

    const db = getFirestore();
    await db
      .collection(COLLECTIONS.bookings)
      .doc(created.data.holdId)
      .update({ holdExpiresAt: Timestamp.fromMillis(Date.now() - 60_000) });

    await signInAs(STAFF_EMAIL);
    const result = await getStaffSchedule({ dateISO });
    const found = result.data.bookings.find((b) => b.bookingId === created.data.holdId);
    expect(found?.displayStatus).toBe("expired-hold");
  });

  it("a confirmed booking displays as confirmed", async () => {
    const dateISO = addDaysToColomboToday(172);
    const db = getFirestore();
    const ref = db.collection(COLLECTIONS.bookings).doc();
    await ref.set({
      packageId: "ac-small",
      roomId: "room-4",
      dateISO,
      startMinute: 9 * 60,
      endMinute: 12 * 60,
      bookingStatus: "confirmed",
      totalAmountMinor: 320000,
      currency: "LKR",
      peopleCount: 2,
      customerName: "Staff Test Confirmed",
      customerPhone: "0770000003",
      customerEmail: "confirmed-staff-test@example.com",
      referenceCode: "TESTCONF",
      source: "test-seed",
      idempotencyKey: `staff-test-confirmed-${Math.random().toString(36).slice(2)}`,
      createdAt: Timestamp.now(),
    });

    await signInAs(STAFF_EMAIL);
    const result = await getStaffSchedule({ dateISO });
    const found = result.data.bookings.find((b) => b.bookingId === ref.id);
    expect(found?.displayStatus).toBe("confirmed");
  });
});
