import { describe, expect, it } from "vitest";
import { en, si } from "./translations";

function collectLeafPaths(node: unknown, prefix = ""): string[] {
  if (typeof node === "string") return [prefix];
  if (node && typeof node === "object") {
    return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
      collectLeafPaths(value, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [];
}

describe("i18n dictionary parity", () => {
  it("en and si expose exactly the same set of translation keys", () => {
    const enKeys = collectLeafPaths(en).sort();
    const siKeys = collectLeafPaths(si).sort();
    expect(siKeys).toEqual(enKeys);
  });

  it("no translation value is an empty string", () => {
    for (const dict of [en, si]) {
      for (const path of collectLeafPaths(dict)) {
        const value = path.split(".").reduce<unknown>((n, k) => (n as Record<string, unknown>)[k], dict);
        expect(String(value).trim().length, `empty value at "${path}"`).toBeGreaterThan(0);
      }
    }
  });
});
