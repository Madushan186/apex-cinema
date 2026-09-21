import type { SlotTime } from "./types";
import { SLOT_TIMES } from "./types";
import { slotTimeToMinutes } from "./time";

/**
 * Confirmed facts from docs/PROJECT_BRIEF.md — shared by the frontend and
 * Cloud Functions so both sides agree on business hours without duplicating
 * the numbers. Never edit one side without the other; there is only one side.
 */
export const OPEN_MINUTE = 9 * 60; // 09:00
export const CLOSE_MINUTE = 21 * 60; // 21:00
export const SESSION_MINUTES = 180; // full 3-hour sessions, no cleaning buffer

/** Default only — see docs/DECISIONS.md D7 ("configurable, default 10 minutes"). */
export const DEFAULT_HOLD_DURATION_MINUTES = 10;

/**
 * Confirmed fact from docs/PROJECT_BRIEF.md ("+1 hour extension for LKR
 * 1,000") and docs/DECISIONS.md D16 — a fixed fee per approved one-hour
 * extension, not client-supplied. Shared here (not read from `config/
 * booking`) so the marketing copy, the staff extension dialog, and the
 * server-side charge computation can never drift apart — same reasoning as
 * OPEN_MINUTE/CLOSE_MINUTE/SESSION_MINUTES above.
 */
export const EXTENSION_FEE_LKR = 1000;
export const EXTENSION_MINUTES = 60;

/**
 * Business decision (docs/DECISIONS.md D17, owner-approved): every new
 * booking — online, phone, walk-in, and eventually Party — requires this
 * advance before confirmation. It is part of the package total, not an
 * extra fee: a staff-entered booking's balance due is
 * `total - amountPaidMinor`, and the advance counts directly against that
 * total from the moment it's recorded. Shared here (not read from
 * `config/booking`) for the same reason as EXTENSION_FEE_LKR above — the
 * marketing copy, the staff booking flow, and the server-side charge
 * computation can never drift apart. Supersedes the prior D14 permission to
 * create a confirmed-but-unpaid manual booking — see D17.
 */
export const ADVANCE_AMOUNT_LKR = 1000;

/**
 * The current amount actually owed on a booking, in minor units — the
 * original package price plus every approved extension's charge (D16).
 * Never a third stored grand-total field; always computed from the two
 * numbers it's derived from, so it can't drift out of sync with either.
 */
export function currentBookingTotalMinor(totalAmountMinor: number, extensionChargesMinor: number): number {
  return totalAmountMinor + extensionChargesMinor;
}

/**
 * Derives a manual booking's payment status from its actual paid amount
 * against its current total (docs/DECISIONS.md D17) — never a
 * separately-stored field that could drift from the payment ledger it
 * summarizes. Only ever returns one of these three values; the wider
 * `PaymentStatus` type also carries the online/PayHere states, which this
 * function never produces.
 */
export function derivePaymentStatus(
  amountPaidMinor: number,
  currentTotalMinor: number,
): "unpaid" | "partially_paid" | "paid" {
  if (amountPaidMinor <= 0) return "unpaid";
  if (amountPaidMinor >= currentTotalMinor) return "paid";
  return "partially_paid";
}

const PUBLIC_START_MINUTES: readonly number[] = SLOT_TIMES.map(slotTimeToMinutes);

export function isPublicStartTime(time: string): time is SlotTime {
  return (SLOT_TIMES as readonly string[]).includes(time);
}

export function isPublicStartMinute(minute: number): boolean {
  return PUBLIC_START_MINUTES.includes(minute);
}

export function computeEndMinute(startMinute: number, sessionMinutes: number): number {
  return startMinute + sessionMinutes;
}

/** A session must finish at or before closing — no session runs past 21:00. */
export function endsWithinBusinessHours(endMinute: number): boolean {
  return endMinute <= CLOSE_MINUTE;
}

/** YYYY-MM-DD, matching the format produced by Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Colombo"}). */
const DATE_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateISO(dateISO: string): boolean {
  if (!DATE_ISO_PATTERN.test(dateISO)) return false;
  const [y, m, d] = dateISO.split("-").map(Number);
  if (!y || !m || !d) return false;
  // Reject e.g. 2026-02-30 — construct in UTC and check it round-trips.
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function isValidPeopleCount(peopleCount: number, maxPeople: number): boolean {
  return Number.isInteger(peopleCount) && peopleCount >= 1 && peopleCount <= maxPeople;
}
