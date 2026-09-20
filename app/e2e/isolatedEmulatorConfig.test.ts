// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { callableUrl } from "./functionsEmulator";
import { assertLoopbackEmulatorUrl, getIsolatedEmulatorConfig } from "./isolatedEmulatorConfig";

/**
 * Unit tests for the isolated-test-config validation (see
 * isolatedEmulatorConfig.ts's own docstring for the incident this guards
 * against). Pure Node, no emulator or browser needed — these prove the
 * *validation itself* is correct: missing/invalid config fails fast with
 * zero network activity, and a genuinely isolated config works.
 */

const TEST_ENV_KEYS = ["TEST_PROJECT_ID", "TEST_AUTH_EMULATOR_PORT", "TEST_FIRESTORE_EMULATOR_PORT", "TEST_FUNCTIONS_EMULATOR_PORT"] as const;

const VALID_ISOLATED_ENV = {
  TEST_PROJECT_ID: "demo-apex-cinema-test",
  TEST_AUTH_EMULATOR_PORT: "9199",
  TEST_FIRESTORE_EMULATOR_PORT: "8180",
  TEST_FUNCTIONS_EMULATOR_PORT: "5101",
};

let savedEnv: Record<string, string | undefined>;
let originalFetch: typeof fetch | undefined;
let fetchCalls: unknown[][];

beforeEach(() => {
  savedEnv = {};
  for (const key of TEST_ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }

  // A spy standing in for any real network call — these functions build
  // strings and throw; they must never reach out to the network at all.
  fetchCalls = [];
  originalFetch = globalThis.fetch;
  globalThis.fetch = ((...args: unknown[]) => {
    fetchCalls.push(args);
    throw new Error("fetch should never be called by config validation");
  }) as typeof fetch;
});

afterEach(() => {
  for (const key of TEST_ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  if (originalFetch) globalThis.fetch = originalFetch;
});

function setEnv(overrides: Partial<Record<(typeof TEST_ENV_KEYS)[number], string>>): void {
  for (const key of TEST_ENV_KEYS) {
    const value = overrides[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe("getIsolatedEmulatorConfig / callableUrl — missing or invalid config fails before any network request", () => {
  it("throws when every TEST_* var is unset, and makes zero network requests", () => {
    expect(() => getIsolatedEmulatorConfig()).toThrow(/missing TEST_PROJECT_ID/);
    expect(() => callableUrl("getPackages")).toThrow(/missing TEST_PROJECT_ID/);
    expect(fetchCalls).toHaveLength(0);
  });

  it("throws when TEST_PROJECT_ID is missing but ports are set", () => {
    setEnv({ TEST_AUTH_EMULATOR_PORT: "9199", TEST_FIRESTORE_EMULATOR_PORT: "8180", TEST_FUNCTIONS_EMULATOR_PORT: "5101" });
    expect(() => getIsolatedEmulatorConfig()).toThrow(/missing TEST_PROJECT_ID/);
    expect(fetchCalls).toHaveLength(0);
  });

  it("throws when TEST_PROJECT_ID isn't demo-prefixed", () => {
    setEnv({ ...VALID_ISOLATED_ENV, TEST_PROJECT_ID: "apex-cinema-test" });
    expect(() => getIsolatedEmulatorConfig()).toThrow(/must be a "demo-"-prefixed/);
    expect(fetchCalls).toHaveLength(0);
  });

  it("throws when TEST_PROJECT_ID equals the live preview's own project id — never defaults or coincides with it", () => {
    setEnv({ ...VALID_ISOLATED_ENV, TEST_PROJECT_ID: "demo-apex-cinema" });
    expect(() => getIsolatedEmulatorConfig()).toThrow(/live preview's own project id/);
    expect(() => callableUrl("createHold")).toThrow(/live preview's own project id/);
    expect(fetchCalls).toHaveLength(0);
  });

  it("throws when a required port is missing", () => {
    setEnv({ TEST_PROJECT_ID: VALID_ISOLATED_ENV.TEST_PROJECT_ID, TEST_AUTH_EMULATOR_PORT: "9199", TEST_FIRESTORE_EMULATOR_PORT: "8180" });
    expect(() => getIsolatedEmulatorConfig()).toThrow(/missing TEST_FUNCTIONS_EMULATOR_PORT/);
    expect(fetchCalls).toHaveLength(0);
  });

  it.each(["0", "-1", "not-a-number", "70000", "5001.5"])("throws when TEST_FUNCTIONS_EMULATOR_PORT=%s is not a valid port", (bad) => {
    setEnv({ ...VALID_ISOLATED_ENV, TEST_FUNCTIONS_EMULATOR_PORT: bad });
    expect(() => getIsolatedEmulatorConfig()).toThrow(/not a valid TCP port/);
    expect(fetchCalls).toHaveLength(0);
  });

  it.each([
    ["TEST_AUTH_EMULATOR_PORT", "9099"],
    ["TEST_FIRESTORE_EMULATOR_PORT", "8080"],
    ["TEST_FUNCTIONS_EMULATOR_PORT", "5001"],
  ] as const)("throws when %s matches the live preview's own port (%s) — never defaults or coincides with it", (key, previewPort) => {
    setEnv({ ...VALID_ISOLATED_ENV, [key]: previewPort });
    expect(() => getIsolatedEmulatorConfig()).toThrow(/matches the live preview's own/);
    expect(fetchCalls).toHaveLength(0);
  });

  it("throws when isolated ports collide with each other", () => {
    setEnv({ ...VALID_ISOLATED_ENV, TEST_FIRESTORE_EMULATOR_PORT: VALID_ISOLATED_ENV.TEST_AUTH_EMULATOR_PORT });
    expect(() => getIsolatedEmulatorConfig()).toThrow(/must all be distinct from each other/);
    expect(fetchCalls).toHaveLength(0);
  });

  it("callableUrl throws synchronously (not a rejected Promise) so a caller's request.post(callableUrl(...)) never evaluates its second argument", () => {
    let threw = false;
    try {
      const url: string = callableUrl("getPackages");
      void url;
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    expect(fetchCalls).toHaveLength(0);
  });
});

describe("getIsolatedEmulatorConfig / callableUrl — a genuinely isolated configuration works", () => {
  it("returns the exact validated shape for a fully valid isolated config", () => {
    setEnv(VALID_ISOLATED_ENV);
    expect(getIsolatedEmulatorConfig()).toEqual({
      projectId: "demo-apex-cinema-test",
      authPort: 9199,
      firestorePort: 8180,
      functionsPort: 5101,
    });
  });

  it("builds a well-formed loopback callable URL", () => {
    setEnv(VALID_ISOLATED_ENV);
    expect(callableUrl("getPackages")).toBe("http://127.0.0.1:5101/demo-apex-cinema-test/us-central1/getPackages");
    expect(fetchCalls).toHaveLength(0); // callableUrl only builds a string; it never performs the request itself.
  });

  it("accepts other demo-prefixed ids distinct from the preview's", () => {
    setEnv({ ...VALID_ISOLATED_ENV, TEST_PROJECT_ID: "demo-apex-cinema-ci" });
    expect(() => getIsolatedEmulatorConfig()).not.toThrow();
  });
});

describe("assertLoopbackEmulatorUrl", () => {
  it("accepts a matching loopback http URL", () => {
    expect(() => assertLoopbackEmulatorUrl("http://127.0.0.1:5101/demo-apex-cinema-test/us-central1/getPackages", 5101)).not.toThrow();
    expect(() => assertLoopbackEmulatorUrl("http://localhost:5101/demo-apex-cinema-test/us-central1/getPackages", 5101)).not.toThrow();
  });

  it("rejects a non-loopback host", () => {
    expect(() => assertLoopbackEmulatorUrl("http://example.com:5101/x/us-central1/getPackages", 5101)).toThrow(/loopback host/);
  });

  it("rejects https", () => {
    expect(() => assertLoopbackEmulatorUrl("https://127.0.0.1:5101/x/us-central1/getPackages", 5101)).toThrow(/must use http:/);
  });

  it("rejects a port that doesn't match the expected isolated port", () => {
    expect(() => assertLoopbackEmulatorUrl("http://127.0.0.1:9999/x/us-central1/getPackages", 5101)).toThrow(/does not match the expected isolated port/);
  });
});
