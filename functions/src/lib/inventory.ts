import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import type { BookablePackageId, SlotTime } from "@apex-cinema/booking-core";
import {
  computeEndMinute,
  endsWithinBusinessHours,
  getColomboMinuteOfDay,
  getColomboTodayISO,
  getPackageFacts,
  intervalsOverlap,
  priceLKRToMinorUnits,
  slotTimeToMinutes,
} from "@apex-cinema/booking-core";
import { COLLECTIONS, db, inventoryDocId } from "./firestore";
import { fingerprintHoldRequest, generateReferenceCode } from "./reference";

/**
 * Per-room, per-business-date inventory design (docs/ARCHITECTURE.md §6):
 * one small doc per (roomId, dateISO) holding every interval ever booked on
 * that room that day. A hold-creation transaction reads every candidate
 * room's doc for the tier (at most 3, for Non-AC), checks each for an
 * overlapping *active* interval, and writes to exactly one room's doc plus
 * a new booking doc — all inside a single `runTransaction`. Firestore
 * aborts and retries the whole callback if any document it read is
 * concurrently modified before commit, which is what makes "two
 * simultaneous requests for a 1-room tier: at most one succeeds" and "four
 * simultaneous requests for a 3-room tier: at most three succeed" hold
 * (see functions/tests/inventory.emulator.test.ts).
 *
 * Any *future* inventory-changing operation (payment confirmation,
 * cancellation, extension) MUST go through this same inventory doc + the
 * same transaction pattern to stay consistent — do not invent a second way
 * to mutate room occupancy.
 */

export type IntervalStatus = "pending_hold" | "confirmed";

export interface IntervalRecord {
  readonly bookingId: string;
  readonly startMinute: number;
  readonly endMinute: number;
  readonly status: IntervalStatus;
  /** null once confirmed (no longer subject to expiry). */
  readonly holdExpiresAtMillis: number | null;
}

export interface InventoryDoc {
  readonly roomId: string;
  readonly dateISO: string;
  readonly intervals: readonly IntervalRecord[];
}

/**
 * An interval "counts" against availability if it's confirmed, or if it's a
 * pending hold that hasn't expired yet — evaluated against `nowMillis`
 * (the Cloud Function's own clock) every time, inside the transaction.
 * There is no background sweep this correctness depends on.
 */
export function isActive(interval: IntervalRecord, nowMillis: number): boolean {
  if (interval.status === "confirmed") return true;
  return interval.holdExpiresAtMillis !== null && interval.holdExpiresAtMillis > nowMillis;
}

export function minutesOverlap(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return intervalsOverlap({ startMs: a.start, endMs: a.end }, { startMs: b.start, endMs: b.end });
}

function minuteToISO(dateISO: string, minuteOfDay: number): string {
  const hh = String(Math.floor(minuteOfDay / 60) % 24).padStart(2, "0");
  const mm = String(minuteOfDay % 60).padStart(2, "0");
  return `${dateISO}T${hh}:${mm}:00`;
}

/** First room in `roomIds` with no active overlapping interval, or null if every room is occupied. */
export function findFreeRoom(
  roomIds: readonly string[],
  candidate: { start: number; end: number },
  inventoryByRoom: ReadonlyMap<string, InventoryDoc | undefined>,
  nowMillis: number,
): string | null {
  for (const roomId of roomIds) {
    const intervals = inventoryByRoom.get(roomId)?.intervals ?? [];
    const conflict = intervals.some(
      (interval) => isActive(interval, nowMillis) && minutesOverlap(candidate, { start: interval.startMinute, end: interval.endMinute }),
    );
    if (!conflict) return roomId;
  }
  return null;
}

export interface CreateHoldParams {
  readonly packageId: BookablePackageId;
  readonly dateISO: string;
  readonly time: SlotTime;
  readonly peopleCount: number;
  readonly name: string;
  readonly phone: string;
  readonly email: string;
  readonly idempotencyKey: string;
}

export interface CreateHoldResult {
  readonly holdId: string;
  readonly referenceCode: string;
  readonly totalAmountMinor: number;
  readonly currency: "LKR";
  readonly startISO: string;
  readonly endISO: string;
  readonly expiresAtMillis: number;
}

interface IdempotencyRecord {
  readonly fingerprint: string;
  readonly response: CreateHoldResult;
}

export async function createHoldTransactional(
  params: CreateHoldParams,
  holdDurationMinutes: number,
): Promise<CreateHoldResult> {
  const facts = getPackageFacts(params.packageId);
  if (!facts || !facts.isBookableOnline) {
    throw new HttpsError("invalid-argument", "Unknown or non-bookable package.");
  }
  const sessionMinutes = facts.sessionMinutes;
  if (sessionMinutes === null) {
    // Can't happen for a bookable package today, but guards against a future
    // catalog edit accidentally making an unconfirmed-duration package bookable.
    throw new HttpsError("failed-precondition", "This package's session length is not confirmed yet.");
  }

  const startMinute = slotTimeToMinutes(params.time);
  const endMinute = computeEndMinute(startMinute, sessionMinutes);
  if (!endsWithinBusinessHours(endMinute)) {
    throw new HttpsError("invalid-argument", "That session would end after closing time.");
  }

  // Reject past dates/times using the server's own Asia/Colombo clock —
  // never a client-supplied "now" (docs/PROJECT_BRIEF.md "reject past
  // dates/start times").
  const todayISO = getColomboTodayISO();
  if (params.dateISO < todayISO) {
    throw new HttpsError("invalid-argument", "That date has already passed.");
  }
  if (params.dateISO === todayISO && startMinute <= getColomboMinuteOfDay()) {
    throw new HttpsError("invalid-argument", "That start time has already passed today.");
  }

  const fingerprint = fingerprintHoldRequest(params);
  const idempotencyRef = db.collection(COLLECTIONS.holdIdempotency).doc(params.idempotencyKey);
  const roomIds = facts.roomIds;
  const inventoryRefs = roomIds.map((roomId) =>
    db.collection(COLLECTIONS.inventory).doc(inventoryDocId(roomId, params.dateISO)),
  );

  return db.runTransaction(async (transaction) => {
    // Firestore transactions require every read before any write.
    const idempotencySnap = await transaction.get(idempotencyRef);
    const inventorySnaps = await Promise.all(inventoryRefs.map((ref) => transaction.get(ref)));

    if (idempotencySnap.exists) {
      const existing = idempotencySnap.data() as IdempotencyRecord;
      if (existing.fingerprint !== fingerprint) {
        throw new HttpsError(
          "already-exists",
          "This idempotency key was already used for a different booking request.",
        );
      }
      // Exact retry: return the original result unchanged. No new hold, no new writes.
      return existing.response;
    }

    const nowMillis = Date.now();
    const inventoryByRoom = new Map<string, InventoryDoc | undefined>(
      roomIds.map((roomId, i) => [roomId, inventorySnaps[i]?.data() as InventoryDoc | undefined]),
    );

    const freeRoomId = findFreeRoom(roomIds, { start: startMinute, end: endMinute }, inventoryByRoom, nowMillis);
    if (!freeRoomId) {
      // No writes staged yet — throwing here leaves Firestore untouched.
      throw new HttpsError(
        "failed-precondition",
        "No rooms are available for this package at that date and time.",
      );
    }

    const bookingRef = db.collection(COLLECTIONS.bookings).doc();
    const holdExpiresAtMillis = nowMillis + holdDurationMinutes * 60_000;
    const totalAmountMinor = priceLKRToMinorUnits(facts.priceLKR);
    const referenceCode = generateReferenceCode();

    const newInterval: IntervalRecord = {
      bookingId: bookingRef.id,
      startMinute,
      endMinute,
      status: "pending_hold",
      holdExpiresAtMillis,
    };
    const existingIntervals = inventoryByRoom.get(freeRoomId)?.intervals ?? [];
    const inventoryRef = inventoryRefs[roomIds.indexOf(freeRoomId)];
    if (!inventoryRef) throw new HttpsError("internal", "Inventory reference resolution failed.");

    transaction.set(inventoryRef, {
      roomId: freeRoomId,
      dateISO: params.dateISO,
      intervals: [...existingIntervals, newInterval],
    });

    transaction.set(bookingRef, {
      packageId: params.packageId,
      roomId: freeRoomId,
      dateISO: params.dateISO,
      startMinute,
      endMinute,
      bookingStatus: "pending_hold",
      holdExpiresAt: Timestamp.fromMillis(holdExpiresAtMillis),
      totalAmountMinor,
      currency: "LKR",
      peopleCount: params.peopleCount,
      customerName: params.name,
      customerPhone: params.phone,
      customerEmail: params.email,
      referenceCode,
      source: "online",
      idempotencyKey: params.idempotencyKey,
      createdAt: FieldValue.serverTimestamp(),
    });

    const response: CreateHoldResult = {
      holdId: bookingRef.id,
      referenceCode,
      totalAmountMinor,
      currency: "LKR",
      startISO: minuteToISO(params.dateISO, startMinute),
      endISO: minuteToISO(params.dateISO, endMinute),
      expiresAtMillis: holdExpiresAtMillis,
    };

    const idempotencyRecord: IdempotencyRecord = { fingerprint, response };
    transaction.set(idempotencyRef, { ...idempotencyRecord, createdAt: FieldValue.serverTimestamp() });

    return response;
  });
}
