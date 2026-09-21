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
import { fingerprintHoldRequest, fingerprintManualBookingRequest, generateReferenceCode } from "./reference";
import type { ManualBookingSource } from "./validation";

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

export type IntervalStatus = "pending_hold" | "confirmed" | "cancelled";

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
 *
 * A "cancelled" interval (see cancelManualBookingTransactional below) is
 * always inactive — it falls through to the `holdExpiresAtMillis` check
 * below, and a cancelled interval always has that field set to `null`, so
 * this never needs its own explicit branch. Kept as a documented invariant
 * rather than a silent coincidence: if a future change ever writes a
 * cancelled interval with a non-null `holdExpiresAtMillis`, this comment is
 * the tripwire for whoever's reading this to notice `isActive` no longer
 * handles it correctly.
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

/**
 * Staff/Owner manual reservation (docs/PROGRESS.md "Staff/Owner manual
 * bookings" phase). Deliberately reuses this file's exact inventory-doc +
 * transaction pattern (findFreeRoom/isActive/minutesOverlap, unchanged) so
 * manual reservations and online holds share one real inventory and can
 * never disagree about whether a room is free.
 *
 * Differences from createHoldTransactional, all intentional:
 *  - Writes `bookingStatus: "confirmed"` and a `confirmed` interval
 *    (holdExpiresAtMillis: null) directly — no pending-hold stage. A manual
 *    reservation is a confirmed room reservation from the moment staff
 *    submits it, and — because `isActive()` treats "confirmed" as always
 *    active — it never expires the way an online hold does (see
 *    docs/ARCHITECTURE.md §6).
 *  - Writes `paymentStatus: "unpaid"` (docs/DECISIONS.md D14) — booking
 *    confirmation is NOT payment confirmation; no payment collection exists
 *    this phase. This is a fixed value, not an editable field.
 *  - Records `createdBy` (the authenticated staff/owner uid) and `source`
 *    ("staff_walkin" | "staff_phone") instead of "online".
 *  - Writes one `auditLog` entry in the same transaction — actor, action,
 *    booking id, room, date, source, server timestamp. Deliberately NO
 *    customer name/phone/email (docs/SECURITY.md §8: audit entries must not
 *    duplicate PII; the booking doc itself is the one place that lives).
 *  - Idempotency lives in its own `manualBookingIdempotency` collection
 *    (not `holdIdempotency`) and the fingerprint includes `actorUid`, so a
 *    replay is only ever "the same" when it's the same staff/owner account
 *    resubmitting its own attempt.
 */
export interface CreateManualBookingParams {
  readonly packageId: BookablePackageId;
  readonly dateISO: string;
  readonly time: SlotTime;
  readonly peopleCount: number;
  readonly name: string;
  readonly phone: string;
  readonly email: string;
  readonly source: ManualBookingSource;
  readonly staffNote: string;
  readonly idempotencyKey: string;
}

export interface CreateManualBookingResult {
  readonly bookingId: string;
  readonly referenceCode: string;
  readonly roomId: string;
  readonly totalAmountMinor: number;
  readonly currency: "LKR";
  readonly startISO: string;
  readonly endISO: string;
  /** Always "unpaid" this phase — see docs/DECISIONS.md D14. */
  readonly paymentStatus: "unpaid";
}

interface ManualIdempotencyRecord {
  readonly fingerprint: string;
  readonly response: CreateManualBookingResult;
}

export async function createManualBookingTransactional(
  params: CreateManualBookingParams,
  actorUid: string,
): Promise<CreateManualBookingResult> {
  const facts = getPackageFacts(params.packageId);
  if (!facts || !facts.isBookableOnline) {
    // "isBookableOnline" also excludes Party for this manual flow — Party
    // stays entirely out of scope this phase (docs/PROGRESS.md).
    throw new HttpsError("invalid-argument", "Unknown or non-bookable package.");
  }
  const sessionMinutes = facts.sessionMinutes;
  if (sessionMinutes === null) {
    throw new HttpsError("failed-precondition", "This package's session length is not confirmed yet.");
  }

  const startMinute = slotTimeToMinutes(params.time);
  const endMinute = computeEndMinute(startMinute, sessionMinutes);
  if (!endsWithinBusinessHours(endMinute)) {
    throw new HttpsError("invalid-argument", "That session would end after closing time.");
  }

  // Reject past dates/times using the server's own Asia/Colombo clock — same
  // rule as createHoldTransactional, never a client-supplied "now".
  const todayISO = getColomboTodayISO();
  if (params.dateISO < todayISO) {
    throw new HttpsError("invalid-argument", "That date has already passed.");
  }
  if (params.dateISO === todayISO && startMinute <= getColomboMinuteOfDay()) {
    throw new HttpsError("invalid-argument", "That start time has already passed today.");
  }

  const fingerprint = fingerprintManualBookingRequest({ actorUid, ...params });
  const idempotencyRef = db.collection(COLLECTIONS.manualBookingIdempotency).doc(params.idempotencyKey);
  const roomIds = facts.roomIds;
  const inventoryRefs = roomIds.map((roomId) =>
    db.collection(COLLECTIONS.inventory).doc(inventoryDocId(roomId, params.dateISO)),
  );

  return db.runTransaction(async (transaction) => {
    // Firestore transactions require every read before any write.
    const idempotencySnap = await transaction.get(idempotencyRef);
    const inventorySnaps = await Promise.all(inventoryRefs.map((ref) => transaction.get(ref)));

    if (idempotencySnap.exists) {
      const existing = idempotencySnap.data() as ManualIdempotencyRecord;
      if (existing.fingerprint !== fingerprint) {
        throw new HttpsError(
          "already-exists",
          "This idempotency key was already used for a different booking request.",
        );
      }
      // Exact retry: return the original result unchanged — no new booking,
      // no new inventory write, no new audit entry.
      return existing.response;
    }

    const nowMillis = Date.now();
    const inventoryByRoom = new Map<string, InventoryDoc | undefined>(
      roomIds.map((roomId, i) => [roomId, inventorySnaps[i]?.data() as InventoryDoc | undefined]),
    );

    // Same shared free-room lookup as the online path — a confirmed booking
    // or an unexpired hold on any candidate room blocks this reservation;
    // an expired hold does not; adjacent sessions are fine (half-open
    // interval overlap, not slot-index equality).
    const freeRoomId = findFreeRoom(roomIds, { start: startMinute, end: endMinute }, inventoryByRoom, nowMillis);
    if (!freeRoomId) {
      // No writes staged yet — throwing here leaves Firestore untouched.
      throw new HttpsError(
        "failed-precondition",
        "No rooms are available for this package at that date and time.",
      );
    }

    const bookingRef = db.collection(COLLECTIONS.bookings).doc();
    const totalAmountMinor = priceLKRToMinorUnits(facts.priceLKR);
    const referenceCode = generateReferenceCode();

    const newInterval: IntervalRecord = {
      bookingId: bookingRef.id,
      startMinute,
      endMinute,
      status: "confirmed",
      // Never expires — a manual reservation is confirmed immediately, not
      // a hold. See docs/PROGRESS.md "must not expire after the online hold
      // period."
      holdExpiresAtMillis: null,
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
      bookingStatus: "confirmed",
      paymentStatus: "unpaid",
      totalAmountMinor,
      currency: "LKR",
      peopleCount: params.peopleCount,
      customerName: params.name,
      customerPhone: params.phone,
      customerEmail: params.email,
      referenceCode,
      source: params.source,
      createdBy: actorUid,
      staffNote: params.staffNote,
      idempotencyKey: params.idempotencyKey,
      createdAt: FieldValue.serverTimestamp(),
    });

    const response: CreateManualBookingResult = {
      bookingId: bookingRef.id,
      referenceCode,
      roomId: freeRoomId,
      totalAmountMinor,
      currency: "LKR",
      startISO: minuteToISO(params.dateISO, startMinute),
      endISO: minuteToISO(params.dateISO, endMinute),
      paymentStatus: "unpaid",
    };

    const idempotencyRecord: ManualIdempotencyRecord = { fingerprint, response };
    transaction.set(idempotencyRef, { ...idempotencyRecord, createdAt: FieldValue.serverTimestamp() });

    // Audit trail — actor, action, and enough to locate the booking, but no
    // customer PII (docs/SECURITY.md §8).
    const auditRef = db.collection(COLLECTIONS.auditLog).doc();
    transaction.set(auditRef, {
      actorUid,
      action: "manual_booking_created",
      targetType: "booking",
      targetId: bookingRef.id,
      roomId: freeRoomId,
      dateISO: params.dateISO,
      source: params.source,
      createdAt: FieldValue.serverTimestamp(),
    });

    return response;
  });
}

/**
 * Cancellation of a confirmed, unpaid, staff/owner-entered manual
 * reservation for a standard room (1–5) — docs/PROGRESS.md "manual-booking
 * cancellation" phase, docs/DECISIONS.md D10/D15. Deliberately narrow, per
 * this phase's approved rules:
 *  - Only bookings created via createManualBookingTransactional are
 *    eligible: `source` must be "staff_walkin" or "staff_phone" (excludes
 *    online holds/bookings, and any future "staff_party" source — Party is
 *    out of scope). Checked directly, not inferred from `bookingStatus`
 *    alone, so this stays correct even once a future phase teaches online
 *    bookings to reach `bookingStatus: "confirmed"` too.
 *  - Only `paymentStatus: "unpaid"` bookings are eligible — the only value
 *    that exists for manual bookings today (D14), checked explicitly so
 *    this doesn't silently widen once a future phase adds payment
 *    recording and `paymentStatus` can become something else.
 *  - Only standard rooms (packages where `isBookableOnline` is true) —
 *    excludes Party (room 6), same check `createManualBookingTransactional`
 *    already uses to keep Party out of the manual-booking surface.
 *  - Only before the session starts, checked against the server's own
 *    Asia/Colombo clock — never a client-supplied "now" (same rule
 *    createHoldTransactional/createManualBookingTransactional already use
 *    for rejecting past-dated requests). No Owner override for a started
 *    booking this phase (docs/DECISIONS.md D15) — that's explicitly future
 *    work, not silently implemented here.
 *  - Cancellation never changes `paymentStatus` and never issues a refund —
 *    it only flips `bookingStatus` and records who/when/why.
 *
 * Idempotency is the booking's own current state, not a separate
 * idempotency-key collection: this operation is a state transition on an
 * existing document, not a create-a-new-resource operation, so "has this
 * already happened" is exactly "is bookingStatus already cancelled" — no
 * second source of truth to keep in sync. A retry/double-click that lands
 * after the first one has committed re-reads the booking fresh (Firestore
 * re-runs the whole transaction callback on a conflicting concurrent write)
 * and takes the early-return branch below: no new write, no new audit
 * entry, no repeated inventory release, and the original cancellation's
 * details are returned unchanged.
 */
export interface CancelManualBookingParams {
  readonly bookingId: string;
  readonly reason: string;
}

export interface CancelManualBookingResult {
  readonly bookingId: string;
  readonly bookingStatus: "cancelled";
  readonly cancelledAtMillis: number;
  readonly cancelledBy: string;
  readonly roomId: string;
  readonly dateISO: string;
}

interface RawBookingForCancellation {
  readonly packageId: string;
  readonly roomId: string;
  readonly dateISO: string;
  readonly startMinute: number;
  readonly endMinute: number;
  readonly bookingStatus: string;
  readonly paymentStatus?: string;
  readonly source?: string;
  readonly cancelledAtMillis?: number;
  readonly cancelledBy?: string;
}

export async function cancelManualBookingTransactional(
  params: CancelManualBookingParams,
  actorUid: string,
): Promise<CancelManualBookingResult> {
  const bookingRef = db.collection(COLLECTIONS.bookings).doc(params.bookingId);

  return db.runTransaction(async (transaction) => {
    // Firestore transactions require every read before any write — the
    // booking doc is read first because whether an inventory read is even
    // needed depends on what it says (the idempotent-no-op branch below
    // needs none at all).
    const bookingSnap = await transaction.get(bookingRef);
    if (!bookingSnap.exists) {
      throw new HttpsError("not-found", "Booking not found.");
    }
    const booking = bookingSnap.data() as RawBookingForCancellation;

    // Idempotent no-op — see the function-level doc comment above. Handles
    // double-clicks and safe retries: the booking's own current state IS
    // the idempotency check, so no duplicate audit entry or repeated
    // inventory release ever happens, regardless of how many times this is
    // called or what `reason` a later call sends.
    if (booking.bookingStatus === "cancelled") {
      return {
        bookingId: params.bookingId,
        bookingStatus: "cancelled",
        cancelledAtMillis: booking.cancelledAtMillis ?? 0,
        cancelledBy: booking.cancelledBy ?? actorUid,
        roomId: booking.roomId,
        dateISO: booking.dateISO,
      };
    }

    if (booking.bookingStatus !== "confirmed") {
      throw new HttpsError("failed-precondition", "Only a confirmed booking can be cancelled.");
    }
    if (booking.source !== "staff_walkin" && booking.source !== "staff_phone") {
      // Excludes online (source: "online") and any future Party source
      // (source: "staff_party") — this operation only ever cancels a
      // staff/owner-entered manual reservation, per this phase's scope.
      throw new HttpsError(
        "failed-precondition",
        "Only staff/owner-entered manual bookings can be cancelled here.",
      );
    }
    if (booking.paymentStatus !== "unpaid") {
      throw new HttpsError("failed-precondition", "Only unpaid bookings can be cancelled here.");
    }

    const facts = getPackageFacts(booking.packageId);
    if (!facts || !facts.isBookableOnline) {
      // Defense-in-depth: excludes Party (room 6) even if a booking doc
      // with packageId "party" somehow reached this state — Party is out
      // of scope for cancellation this phase.
      throw new HttpsError("failed-precondition", "This booking's package cannot be cancelled here.");
    }

    // Eligibility: the session must not have started yet, checked against
    // the server's own Asia/Colombo clock. No Owner override this phase —
    // an in-progress or past booking is rejected for both roles alike (see
    // the function-level doc comment above).
    const todayISO = getColomboTodayISO();
    const nowMinute = getColomboMinuteOfDay();
    const hasStarted = booking.dateISO < todayISO || (booking.dateISO === todayISO && booking.startMinute <= nowMinute);
    if (hasStarted) {
      throw new HttpsError(
        "failed-precondition",
        "This booking has already started and can no longer be cancelled.",
      );
    }

    const inventoryRef = db.collection(COLLECTIONS.inventory).doc(inventoryDocId(booking.roomId, booking.dateISO));
    const inventorySnap = await transaction.get(inventoryRef);
    const inventoryDoc = inventorySnap.data() as InventoryDoc | undefined;
    const intervals = inventoryDoc?.intervals ?? [];
    const targetInterval = intervals.find((interval) => interval.bookingId === params.bookingId);
    if (!targetInterval) {
      // The booking says it's confirmed but its own inventory interval is
      // missing — an internal data-consistency problem, not a normal
      // rejection path. Fail loudly rather than silently cancelling a
      // booking with nothing to release.
      throw new HttpsError("internal", "This booking's inventory record could not be found.");
    }

    // Release ONLY this booking's own interval — every other interval on
    // this room/date (including other bookings' sessions later the same
    // day) is left completely untouched, by construction: `.map()` only
    // ever replaces the one entry whose `bookingId` matches this booking.
    const updatedIntervals = intervals.map((interval) =>
      interval.bookingId === params.bookingId
        ? { ...interval, status: "cancelled" as const, holdExpiresAtMillis: null }
        : interval,
    );

    const nowMillis = Date.now();

    transaction.set(inventoryRef, {
      roomId: booking.roomId,
      dateISO: booking.dateISO,
      intervals: updatedIntervals,
    });

    // Booking history is preserved, not deleted — every original field
    // (customer details, price, source, etc.) stays exactly as written at
    // creation; only the status/cancellation fields are added. paymentStatus
    // is deliberately untouched — cancellation never changes payment status
    // or issues a refund (docs/DECISIONS.md D12/D15).
    transaction.update(bookingRef, {
      bookingStatus: "cancelled",
      cancelledAtMillis: nowMillis,
      cancelledBy: actorUid,
      cancellationReason: params.reason,
    });

    // Audit trail with a real before/after diff (docs/SECURITY.md §8) — the
    // first audit entry in this codebase that's an *edit*, not a creation
    // (see docs/ARCHITECTURE.md §3). Only structural status fields are
    // recorded, never the reason text or any customer detail — the reason
    // lives on the booking doc itself (same precedent as `staffNote`), so
    // it's never duplicated into the audit log.
    const auditRef = db.collection(COLLECTIONS.auditLog).doc();
    transaction.set(auditRef, {
      actorUid,
      action: "manual_booking_cancelled",
      targetType: "booking",
      targetId: params.bookingId,
      roomId: booking.roomId,
      dateISO: booking.dateISO,
      before: { bookingStatus: "confirmed" },
      after: { bookingStatus: "cancelled" },
      createdAt: FieldValue.serverTimestamp(),
    });

    return {
      bookingId: params.bookingId,
      bookingStatus: "cancelled",
      cancelledAtMillis: nowMillis,
      cancelledBy: actorUid,
      roomId: booking.roomId,
      dateISO: booking.dateISO,
    };
  });
}
