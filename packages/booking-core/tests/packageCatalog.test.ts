import { describe, expect, it } from "vitest";
import { PACKAGE_CATALOG, getPackageFacts, priceLKRToMinorUnits } from "../src/packageCatalog";

describe("PACKAGE_CATALOG", () => {
  it("matches the confirmed facts from docs/PROJECT_BRIEF.md", () => {
    const nonAc = getPackageFacts("non-ac");
    expect(nonAc).toMatchObject({ priceLKR: 2300, maxPeople: 3, roomCount: 3, isBookableOnline: true });
    expect(nonAc?.roomIds).toEqual(["room-1", "room-2", "room-3"]);

    const acSmall = getPackageFacts("ac-small");
    expect(acSmall).toMatchObject({ priceLKR: 3200, maxPeople: 3, roomCount: 1, isBookableOnline: true });

    const acLarge = getPackageFacts("ac-large");
    expect(acLarge).toMatchObject({ priceLKR: 4500, maxPeople: 5, roomCount: 1, isBookableOnline: true });

    const party = getPackageFacts("party");
    expect(party).toMatchObject({ priceLKR: 12500, maxPeople: 12, isBookableOnline: false, sessionMinutes: null });
  });

  it("excludes party from public booking inventory", () => {
    const bookable = PACKAGE_CATALOG.filter((pkg) => pkg.isBookableOnline);
    expect(bookable.map((p) => p.id).sort()).toEqual(["ac-large", "ac-small", "non-ac"]);
  });

  it("returns undefined for an unknown id", () => {
    expect(getPackageFacts("does-not-exist")).toBeUndefined();
  });
});

describe("priceLKRToMinorUnits", () => {
  it("converts whole rupees to integer minor units (cents)", () => {
    expect(priceLKRToMinorUnits(2300)).toBe(230000);
    expect(priceLKRToMinorUnits(12500)).toBe(1250000);
  });

  it("always returns an integer", () => {
    expect(Number.isInteger(priceLKRToMinorUnits(2300))).toBe(true);
  });
});
