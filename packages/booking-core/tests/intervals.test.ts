import { describe, expect, it } from "vitest";
import { intervalsOverlap } from "../src/intervals";

const hours = (h: number) => h * 60 * 60 * 1000;

describe("intervalsOverlap", () => {
  it("detects a full overlap", () => {
    const a = { startMs: hours(9), endMs: hours(12) };
    const b = { startMs: hours(10), endMs: hours(11) };
    expect(intervalsOverlap(a, b)).toBe(true);
  });

  it("detects a partial overlap", () => {
    // 09:00-13:00 extended booking vs the 12:00-15:00 public slot
    const extended = { startMs: hours(9), endMs: hours(13) };
    const nextPublicSlot = { startMs: hours(12), endMs: hours(15) };
    expect(intervalsOverlap(extended, nextPublicSlot)).toBe(true);
  });

  it("treats back-to-back bookings as non-overlapping (no buffer)", () => {
    const first = { startMs: hours(9), endMs: hours(12) };
    const second = { startMs: hours(12), endMs: hours(15) };
    expect(intervalsOverlap(first, second)).toBe(false);
  });

  it("returns false for disjoint intervals", () => {
    const a = { startMs: hours(9), endMs: hours(12) };
    const b = { startMs: hours(15), endMs: hours(18) };
    expect(intervalsOverlap(a, b)).toBe(false);
  });

  it("is symmetric", () => {
    const a = { startMs: hours(9), endMs: hours(12) };
    const b = { startMs: hours(10), endMs: hours(13) };
    expect(intervalsOverlap(a, b)).toBe(intervalsOverlap(b, a));
  });
});
