import { describe, expect, it } from "vitest";
import { createFixtureAvailabilityAdapter } from "./availabilityAdapter";

describe("fixture availability adapter", () => {
  it("is deterministic for the same inputs", async () => {
    const adapter = createFixtureAvailabilityAdapter();
    const a = await adapter.getAvailability({ packageId: "non-ac", dateISO: "2026-12-01" });
    const b = await adapter.getAvailability({ packageId: "non-ac", dateISO: "2026-12-01" });
    expect(a).toEqual(b);
  });

  it("returns all four fixed slot times", async () => {
    const adapter = createFixtureAvailabilityAdapter();
    const result = await adapter.getAvailability({ packageId: "ac-large", dateISO: "2026-12-01" });
    expect(result.slots.map((s) => s.time)).toEqual(["09:00", "12:00", "15:00", "18:00"]);
  });

  it("non-ac (3 rooms) is 'available' only when all 3 rooms are free, 'limited' when 1-2 are free, 'full' at 0", async () => {
    const adapter = createFixtureAvailabilityAdapter();
    const result = await adapter.getAvailability({ packageId: "non-ac", dateISO: "2026-12-01" });
    for (const slot of result.slots) {
      if (slot.status === "available") expect(slot.roomsFree).toBe(3);
      if (slot.status === "limited") expect(slot.roomsFree).toBeGreaterThan(0);
      if (slot.status === "limited") expect(slot.roomsFree).toBeLessThan(3);
      if (slot.status === "full") expect(slot.roomsFree).toBe(0);
    }
  });

  it("ac-small (1 room) is only ever 'available' or 'full', never 'limited'", async () => {
    const adapter = createFixtureAvailabilityAdapter();
    const result = await adapter.getAvailability({ packageId: "ac-small", dateISO: "2026-12-01" });
    for (const slot of result.slots) {
      expect(["available", "full"]).toContain(slot.status);
    }
  });

  it("rejects when simulateError is set", async () => {
    const adapter = createFixtureAvailabilityAdapter();
    await expect(
      adapter.getAvailability({ packageId: "ac-large", dateISO: "2026-12-01", simulateError: true }),
    ).rejects.toThrow();
  });
});
