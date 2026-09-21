import { HttpsError } from "firebase-functions/v2/https";
import type { BookablePackageId, SlotTime } from "@apex-cinema/booking-core";
import { getPackageFacts, isPublicStartTime, isValidDateISO, isValidPeopleCount } from "@apex-cinema/booking-core";

// Bounded lengths — abuse/DoS hardening for payload validation (never trust
// client-sent string sizes). Generous enough for real names/emails.
const MAX_STRING_LENGTH = 200;
const MIN_IDEMPOTENCY_KEY_LENGTH = 8;
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;
const MAX_CANCELLATION_REASON_LENGTH = 500;
// Firestore auto-generated document ids are 20 alphanumeric characters, but
// this is deliberately a little more generous/defensive than exact-20 —
// the point is bounding the length and character set, not pinning to one
// SDK's current id format.
const BOOKING_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{1,24}$/;
const SL_PHONE_PATTERN = /^(?:\+94|0)\d{9}$/;

function invalid(message: string): never {
  throw new HttpsError("invalid-argument", message);
}

function isNonEmptyBoundedString(value: unknown, max = MAX_STRING_LENGTH): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

export interface ValidatedAvailabilityRequest {
  readonly packageId: BookablePackageId;
  readonly dateISO: string;
}

export function validateAvailabilityRequest(data: unknown): ValidatedAvailabilityRequest {
  if (!data || typeof data !== "object") invalid("Request body must be an object.");
  const d = data as Record<string, unknown>;

  const packageId = validateBookablePackageId(d.packageId);
  const dateISO = validateDateISO(d.dateISO);

  return { packageId, dateISO };
}

export interface ValidatedHoldRequest {
  readonly packageId: BookablePackageId;
  readonly dateISO: string;
  readonly time: SlotTime;
  readonly peopleCount: number;
  readonly name: string;
  readonly phone: string;
  readonly email: string;
  readonly idempotencyKey: string;
}

export function validateHoldRequest(data: unknown): ValidatedHoldRequest {
  if (!data || typeof data !== "object") invalid("Request body must be an object.");
  const d = data as Record<string, unknown>;

  const packageId = validateBookablePackageId(d.packageId);
  const dateISO = validateDateISO(d.dateISO);

  if (typeof d.time !== "string" || !isPublicStartTime(d.time)) {
    invalid("Start time must be one of the fixed public start times.");
  }
  const time = d.time as SlotTime;

  const facts = getPackageFacts(packageId);
  if (!facts) invalid("Unknown package."); // unreachable given validateBookablePackageId, but keeps TS happy
  if (typeof d.peopleCount !== "number" || !isValidPeopleCount(d.peopleCount, facts.maxPeople)) {
    invalid(`People count must be a whole number between 1 and ${facts.maxPeople} for this package.`);
  }

  if (!isNonEmptyBoundedString(d.name)) invalid("Name is required.");
  if (typeof d.phone !== "string" || !SL_PHONE_PATTERN.test(d.phone.replace(/[\s-]/g, ""))) {
    invalid("A valid Sri Lankan phone number is required.");
  }
  if (typeof d.email !== "string" || d.email.length > MAX_STRING_LENGTH || !EMAIL_PATTERN.test(d.email.trim())) {
    invalid("A valid email address is required.");
  }
  if (
    typeof d.idempotencyKey !== "string" ||
    d.idempotencyKey.length < MIN_IDEMPOTENCY_KEY_LENGTH ||
    d.idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH
  ) {
    invalid("A valid idempotency key is required.");
  }

  return {
    packageId,
    dateISO,
    time,
    peopleCount: d.peopleCount as number,
    name: (d.name as string).trim(),
    phone: (d.phone as string).replace(/[\s-]/g, ""),
    email: (d.email as string).trim().toLowerCase(),
    idempotencyKey: d.idempotencyKey as string,
  };
}

export type ManualBookingSource = "staff_walkin" | "staff_phone";

const MAX_NOTE_LENGTH = 500;

export interface ValidatedManualBookingRequest {
  readonly packageId: BookablePackageId;
  readonly dateISO: string;
  readonly time: SlotTime;
  readonly peopleCount: number;
  readonly name: string;
  readonly phone: string;
  /** "" when not supplied — email is optional for manual reservations. */
  readonly email: string;
  readonly source: ManualBookingSource;
  /** "" when not supplied. */
  readonly staffNote: string;
  readonly idempotencyKey: string;
  /**
   * Must be the literal `true` — docs/DECISIONS.md D17: every new booking
   * requires the LKR 1,000 cash advance before confirmation. This is a
   * staff attestation ("I have received this cash"), never a client-supplied
   * amount — the amount itself is always the server's own
   * ADVANCE_AMOUNT_LKR constant, never read from the request.
   */
  readonly advanceReceivedConfirmation: true;
}

/**
 * Same shape/strictness as validateHoldRequest, with three differences that
 * match this phase's brief: email is optional (not every phone/walk-in
 * customer will give one), a required `source` (phone or walk-in only —
 * no "party" source exists this phase, see docs/PROGRESS.md scope), and a
 * required, literal `advanceReceivedConfirmation: true` (docs/DECISIONS.md
 * D17) — rejected outright, before any Firestore read, if missing or falsy,
 * so an unconfirmed advance can never reach the transaction at all.
 */
export function validateManualBookingRequest(data: unknown): ValidatedManualBookingRequest {
  if (!data || typeof data !== "object") invalid("Request body must be an object.");
  const d = data as Record<string, unknown>;

  const packageId = validateBookablePackageId(d.packageId);
  const dateISO = validateDateISO(d.dateISO);

  if (typeof d.time !== "string" || !isPublicStartTime(d.time)) {
    invalid("Start time must be one of the fixed public start times.");
  }
  const time = d.time as SlotTime;

  const facts = getPackageFacts(packageId);
  if (!facts) invalid("Unknown package."); // unreachable given validateBookablePackageId, but keeps TS happy
  if (typeof d.peopleCount !== "number" || !isValidPeopleCount(d.peopleCount, facts.maxPeople)) {
    invalid(`People count must be a whole number between 1 and ${facts.maxPeople} for this package.`);
  }

  if (!isNonEmptyBoundedString(d.name)) invalid("Name is required.");
  if (typeof d.phone !== "string" || !SL_PHONE_PATTERN.test(d.phone.replace(/[\s-]/g, ""))) {
    invalid("A valid Sri Lankan phone number is required.");
  }

  // Email is optional here (unlike the online hold flow) — validate only if given.
  let email = "";
  if (d.email !== undefined && d.email !== null && d.email !== "") {
    if (typeof d.email !== "string" || d.email.length > MAX_STRING_LENGTH || !EMAIL_PATTERN.test(d.email.trim())) {
      invalid("If given, email must be a valid address.");
    }
    email = (d.email as string).trim().toLowerCase();
  }

  if (d.source !== "staff_walkin" && d.source !== "staff_phone") {
    invalid('source must be "staff_walkin" or "staff_phone".');
  }
  const source = d.source as ManualBookingSource;

  let staffNote = "";
  if (d.staffNote !== undefined && d.staffNote !== null && d.staffNote !== "") {
    if (typeof d.staffNote !== "string" || d.staffNote.length > MAX_NOTE_LENGTH) {
      invalid(`Staff note must be ${MAX_NOTE_LENGTH} characters or fewer.`);
    }
    staffNote = d.staffNote.trim();
  }

  if (
    typeof d.idempotencyKey !== "string" ||
    d.idempotencyKey.length < MIN_IDEMPOTENCY_KEY_LENGTH ||
    d.idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH
  ) {
    invalid("A valid idempotency key is required.");
  }

  // Must be the literal boolean true — not "yes", not 1, not merely
  // truthy — so a UI bug or a curious client can't send some other
  // truthy-looking value and have it silently accepted (docs/DECISIONS.md
  // D17: this is a staff attestation, never preselected or implied).
  if (d.advanceReceivedConfirmation !== true) {
    invalid("You must confirm the LKR 1,000 cash advance was received before creating this booking.");
  }

  return {
    packageId,
    dateISO,
    time,
    peopleCount: d.peopleCount as number,
    name: (d.name as string).trim(),
    phone: (d.phone as string).replace(/[\s-]/g, ""),
    email,
    source,
    staffNote,
    idempotencyKey: d.idempotencyKey as string,
    advanceReceivedConfirmation: true,
  };
}

export interface ValidatedCancelManualBookingRequest {
  readonly bookingId: string;
  readonly reason: string;
}

/**
 * Validates only shape/presence — bookingId a plausible id string, reason a
 * non-empty, length-bounded string. Every actual eligibility rule (booking
 * exists, is a confirmed/unpaid/manual/standard-room booking, hasn't
 * started yet) is checked server-side inside
 * cancelManualBookingTransactional, which needs to read the booking doc
 * anyway — duplicating those checks here would just be a second place for
 * them to drift out of sync.
 */
export function validateCancelManualBookingRequest(data: unknown): ValidatedCancelManualBookingRequest {
  if (!data || typeof data !== "object") invalid("Request body must be an object.");
  const d = data as Record<string, unknown>;

  if (typeof d.bookingId !== "string" || !BOOKING_ID_PATTERN.test(d.bookingId)) {
    invalid("A valid bookingId is required.");
  }
  if (!isNonEmptyBoundedString(d.reason, MAX_CANCELLATION_REASON_LENGTH)) {
    invalid(`A cancellation reason is required (1–${MAX_CANCELLATION_REASON_LENGTH} characters).`);
  }

  return {
    bookingId: d.bookingId as string,
    reason: (d.reason as string).trim(),
  };
}

export interface ValidatedExtendManualBookingRequest {
  readonly bookingId: string;
  readonly expectedCurrentEndMinute: number;
  readonly idempotencyKey: string;
}

/**
 * Validates only shape/presence — bookingId a plausible id string,
 * expectedCurrentEndMinute a plausible in-range minute-of-day, idempotency
 * key length-bounded. Every actual eligibility rule (booking exists, is a
 * confirmed/unpaid/manual/standard-room booking, hasn't ended yet, the new
 * end time fits before closing, no conflicting reservation, and — crucially
 * — that `expectedCurrentEndMinute` actually matches the booking's current
 * end time) is checked server-side inside extendManualBookingTransactional,
 * which needs to read the booking doc anyway.
 */
export function validateExtendManualBookingRequest(data: unknown): ValidatedExtendManualBookingRequest {
  if (!data || typeof data !== "object") invalid("Request body must be an object.");
  const d = data as Record<string, unknown>;

  if (typeof d.bookingId !== "string" || !BOOKING_ID_PATTERN.test(d.bookingId)) {
    invalid("A valid bookingId is required.");
  }
  // A day has 1440 minutes; bounding generously rather than to exact
  // business hours here — the real "is this actually valid for this
  // booking" check happens against the booking's own stored end time
  // inside the transaction.
  if (typeof d.expectedCurrentEndMinute !== "number" || !Number.isInteger(d.expectedCurrentEndMinute) || d.expectedCurrentEndMinute < 0 || d.expectedCurrentEndMinute > 1440) {
    invalid("A valid expectedCurrentEndMinute is required.");
  }
  if (
    typeof d.idempotencyKey !== "string" ||
    d.idempotencyKey.length < MIN_IDEMPOTENCY_KEY_LENGTH ||
    d.idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH
  ) {
    invalid("A valid idempotency key is required.");
  }

  return {
    bookingId: d.bookingId as string,
    expectedCurrentEndMinute: d.expectedCurrentEndMinute as number,
    idempotencyKey: d.idempotencyKey as string,
  };
}

// Generous sanity bound, not a real business limit — the actual "can't pay
// more than the remaining balance" check happens server-side inside the
// transaction against the booking's own real total (see
// lib/payments.ts). LKR 500,000 minor units = LKR 5,000 — comfortably above
// any single package's full price plus several extensions.
const MAX_PAYMENT_AMOUNT_MINOR = 500_000;

export interface ValidatedRecordPaymentRequest {
  readonly bookingId: string;
  readonly amountMinor: number;
  readonly idempotencyKey: string;
}

/**
 * Validates only shape/presence — bookingId a plausible id string,
 * amountMinor a positive bounded integer, idempotency key length-bounded.
 * Every actual eligibility rule (booking exists, is a manual/confirmed
 * booking, not cancelled, and — crucially — that this amount doesn't
 * overpay the booking's real current balance) is checked server-side inside
 * recordManualBookingPaymentTransactional, which needs to read the booking
 * doc anyway (docs/DECISIONS.md D17).
 */
export function validateRecordPaymentRequest(data: unknown): ValidatedRecordPaymentRequest {
  if (!data || typeof data !== "object") invalid("Request body must be an object.");
  const d = data as Record<string, unknown>;

  if (typeof d.bookingId !== "string" || !BOOKING_ID_PATTERN.test(d.bookingId)) {
    invalid("A valid bookingId is required.");
  }
  if (
    typeof d.amountMinor !== "number" ||
    !Number.isInteger(d.amountMinor) ||
    d.amountMinor <= 0 ||
    d.amountMinor > MAX_PAYMENT_AMOUNT_MINOR
  ) {
    invalid("A valid, positive payment amount is required.");
  }
  if (
    typeof d.idempotencyKey !== "string" ||
    d.idempotencyKey.length < MIN_IDEMPOTENCY_KEY_LENGTH ||
    d.idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH
  ) {
    invalid("A valid idempotency key is required.");
  }

  return {
    bookingId: d.bookingId as string,
    amountMinor: d.amountMinor as number,
    idempotencyKey: d.idempotencyKey as string,
  };
}

function validateBookablePackageId(value: unknown): BookablePackageId {
  if (value !== "non-ac" && value !== "ac-small" && value !== "ac-large") {
    invalid("packageId must be a bookable package (party is contact-only).");
  }
  const facts = getPackageFacts(value);
  if (!facts || !facts.isBookableOnline) {
    invalid("packageId must be a bookable package (party is contact-only).");
  }
  return value;
}

function validateDateISO(value: unknown): string {
  if (typeof value !== "string" || !isValidDateISO(value)) {
    invalid("dateISO must be a valid YYYY-MM-DD date.");
  }
  return value as string;
}
