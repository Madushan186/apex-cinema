import { describe, expect, it } from "vitest";
import { addDaysToColomboToday, formatDateLabel, getColomboTodayISO, slotTimeToMinutes } from "./colomboTime";

describe("colomboTime", () => {
  it("slotTimeToMinutes converts HH:mm to minutes since midnight", () => {
    expect(slotTimeToMinutes("09:00")).toBe(540);
    expect(slotTimeToMinutes("18:00")).toBe(1080);
  });

  it("addDaysToColomboToday(0) matches getColomboTodayISO()", () => {
    expect(addDaysToColomboToday(0)).toBe(getColomboTodayISO());
  });

  it("addDaysToColomboToday advances by exactly N calendar days", () => {
    const today = getColomboTodayISO();
    const inSevenDays = addDaysToColomboToday(7);
    const diffMs = Date.parse(`${inSevenDays}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
    expect(diffMs / (1000 * 60 * 60 * 24)).toBe(7);
  });

  it("formatDateLabel never throws for a generated date", () => {
    expect(() => formatDateLabel(getColomboTodayISO(), "en", "short")).not.toThrow();
    expect(() => formatDateLabel(getColomboTodayISO(), "si", "long")).not.toThrow();
  });
});
