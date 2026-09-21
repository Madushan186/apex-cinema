import { describe, expect, it } from "vitest";
import {
  ADVANCE_AMOUNT_LKR,
  CLOSE_MINUTE,
  OPEN_MINUTE,
  computeEndMinute,
  currentBookingTotalMinor,
  derivePaymentStatus,
  endsWithinBusinessHours,
  isPublicStartMinute,
  isPublicStartTime,
  isValidDateISO,
  isValidPeopleCount,
} from "../src/businessRules";

describe("business hours constants", () => {
  it("open/close match 09:00-21:00", () => {
    expect(OPEN_MINUTE).toBe(9 * 60);
    expect(CLOSE_MINUTE).toBe(21 * 60);
  });
});

describe("isPublicStartTime / isPublicStartMinute", () => {
  it("accepts exactly the four fixed public start times", () => {
    for (const time of ["09:00", "12:00", "15:00", "18:00"]) {
      expect(isPublicStartTime(time)).toBe(true);
    }
  });

  it("rejects arbitrary start times", () => {
    for (const time of ["09:30", "10:00", "20:00", "not-a-time", ""]) {
      expect(isPublicStartTime(time)).toBe(false);
    }
  });

  it("isPublicStartMinute agrees with isPublicStartTime", () => {
    expect(isPublicStartMinute(9 * 60)).toBe(true);
    expect(isPublicStartMinute(10 * 60)).toBe(false);
  });
});

describe("computeEndMinute / endsWithinBusinessHours", () => {
  it("a 3-hour session from 18:00 ends exactly at closing (21:00) — allowed", () => {
    const end = computeEndMinute(18 * 60, 180);
    expect(end).toBe(21 * 60);
    expect(endsWithinBusinessHours(end)).toBe(true);
  });

  it("a session ending after closing is rejected", () => {
    const end = computeEndMinute(18 * 60, 181);
    expect(endsWithinBusinessHours(end)).toBe(false);
  });

  it("adjacent sessions (09:00-12:00 then 12:00-15:00) touch but do not extend past closing", () => {
    const firstEnd = computeEndMinute(9 * 60, 180);
    expect(firstEnd).toBe(12 * 60);
  });
});

describe("isValidDateISO", () => {
  it("accepts well-formed real dates", () => {
    expect(isValidDateISO("2026-09-20")).toBe(true);
    expect(isValidDateISO("2026-01-01")).toBe(true);
    expect(isValidDateISO("2024-02-29")).toBe(true); // leap year
  });

  it("rejects malformed or impossible dates", () => {
    expect(isValidDateISO("2026-13-01")).toBe(false);
    expect(isValidDateISO("2026-02-30")).toBe(false);
    expect(isValidDateISO("2023-02-29")).toBe(false); // not a leap year
    expect(isValidDateISO("not-a-date")).toBe(false);
    expect(isValidDateISO("2026/09/20")).toBe(false);
    expect(isValidDateISO("")).toBe(false);
  });
});

describe("isValidPeopleCount", () => {
  it("accepts whole numbers within [1, max]", () => {
    expect(isValidPeopleCount(1, 3)).toBe(true);
    expect(isValidPeopleCount(3, 3)).toBe(true);
  });

  it("rejects zero, negative, non-integer, and over-capacity counts", () => {
    expect(isValidPeopleCount(0, 3)).toBe(false);
    expect(isValidPeopleCount(-1, 3)).toBe(false);
    expect(isValidPeopleCount(1.5, 3)).toBe(false);
    expect(isValidPeopleCount(4, 3)).toBe(false);
  });
});

describe("ADVANCE_AMOUNT_LKR", () => {
  it("is LKR 1,000 (docs/DECISIONS.md D17)", () => {
    expect(ADVANCE_AMOUNT_LKR).toBe(1000);
  });
});

describe("currentBookingTotalMinor", () => {
  it("is the original price plus extension charges, never a third stored field", () => {
    expect(currentBookingTotalMinor(320000, 0)).toBe(320000);
    expect(currentBookingTotalMinor(320000, 100000)).toBe(420000);
  });
});

describe("derivePaymentStatus", () => {
  it("is unpaid at zero paid", () => {
    expect(derivePaymentStatus(0, 320000)).toBe("unpaid");
  });

  it("is partially_paid between zero and the total", () => {
    expect(derivePaymentStatus(100000, 320000)).toBe("partially_paid");
  });

  it("is paid once amount paid reaches (or, defensively, exceeds) the total", () => {
    expect(derivePaymentStatus(320000, 320000)).toBe("paid");
    expect(derivePaymentStatus(400000, 320000)).toBe("paid");
  });
});
