import { HttpsError } from "firebase-functions/v2/https";
import type { BookablePackageId, SlotTime } from "@apex-cinema/booking-core";
import { getPackageFacts, isPublicStartTime, isValidDateISO, isValidPeopleCount } from "@apex-cinema/booking-core";

// Bounded lengths — abuse/DoS hardening for payload validation (never trust
// client-sent string sizes). Generous enough for real names/emails.
const MAX_STRING_LENGTH = 200;
const MIN_IDEMPOTENCY_KEY_LENGTH = 8;
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

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
