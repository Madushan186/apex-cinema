import { describe, expect, it } from "vitest";
import { buildPingResponse } from "../src/index";

describe("buildPingResponse", () => {
  it("reports ok and that booking-core resolved", () => {
    const result = buildPingResponse();
    expect(result.ok).toBe(true);
    expect(result.bookingCoreLinked).toBe(true);
    expect(() => new Date(result.serverTime).toISOString()).not.toThrow();
  });
});
