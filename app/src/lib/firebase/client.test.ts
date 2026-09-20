/**
 * Regression coverage for the "staff initialization bug" (docs/PROGRESS.md):
 * a new staff-auth module once forgot to call
 * `connectToEmulatorsIfConfigured()`, so Firebase Auth silently ran against
 * its default (non-emulator) configuration instead of the local emulator.
 *
 * The fix moved the connection call into this module itself, gated on
 * DATA_MODE, so every consumer (customer booking adapters, staff auth,
 * staff/owner APIs) gets it automatically just by importing `auth` /
 * `firestore` / `functions` from here — no consumer can forget it again.
 * These tests prove that guarantee holds, and that a contradictory
 * configuration (DATA_MODE=emulator with the emulator flag turned off)
 * fails loudly instead of silently risking a real project.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connectAuthEmulator: vi.fn(),
  connectFirestoreEmulator: vi.fn(),
  connectFunctionsEmulator: vi.fn(),
  getAuth: vi.fn(() => ({})),
  getFirestore: vi.fn(() => ({})),
  getFunctions: vi.fn(() => ({})),
  getApps: vi.fn(() => []),
  initializeApp: vi.fn(() => ({})),
}));

vi.mock("firebase/auth", () => ({
  getAuth: mocks.getAuth,
  connectAuthEmulator: mocks.connectAuthEmulator,
}));
vi.mock("firebase/firestore", () => ({
  getFirestore: mocks.getFirestore,
  connectFirestoreEmulator: mocks.connectFirestoreEmulator,
}));
vi.mock("firebase/functions", () => ({
  getFunctions: mocks.getFunctions,
  connectFunctionsEmulator: mocks.connectFunctionsEmulator,
}));
vi.mock("firebase/app", () => ({
  getApps: mocks.getApps,
  initializeApp: mocks.initializeApp,
}));

const FAKE_FIREBASE_CONFIG = {
  apiKey: "demo-api-key",
  authDomain: "demo-apex-cinema.firebaseapp.com",
  projectId: "demo-apex-cinema",
  storageBucket: "demo-apex-cinema.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000000000",
};

/** Fresh module graph per call — client.ts has top-level side effects and module-level state. */
async function loadClientWith(dataMode: "fixture" | "emulator", useEmulator: boolean) {
  vi.resetModules();
  vi.doMock("@/lib/dataMode", () => ({ DATA_MODE: dataMode }));
  vi.doMock("@/lib/env", () => ({
    env: {
      firebase: FAKE_FIREBASE_CONFIG,
      useEmulator,
      emulatorHost: "127.0.0.1",
      emulatorPorts: { auth: 9099, firestore: 8080, functions: 5001 },
    },
  }));
  return import("./client");
}

describe("firebase client — emulator connection guarantee", () => {
  beforeEach(() => {
    mocks.connectAuthEmulator.mockClear();
    mocks.connectFirestoreEmulator.mockClear();
    mocks.connectFunctionsEmulator.mockClear();
    mocks.getApps.mockClear();
    mocks.initializeApp.mockClear();
  });

  it("connects Auth, Firestore, and Functions to the local emulator automatically when DATA_MODE is 'emulator'", async () => {
    await loadClientWith("emulator", true);
    expect(mocks.connectAuthEmulator).toHaveBeenCalledTimes(1);
    expect(mocks.connectFirestoreEmulator).toHaveBeenCalledTimes(1);
    expect(mocks.connectFunctionsEmulator).toHaveBeenCalledTimes(1);
  });

  it("points the emulator connection at 127.0.0.1, never a real host", async () => {
    await loadClientWith("emulator", true);
    const authCall = mocks.connectAuthEmulator.mock.calls[0] as [unknown, string];
    expect(authCall[1]).toContain("127.0.0.1");
    const firestoreCall = mocks.connectFirestoreEmulator.mock.calls[0] as [unknown, string, number];
    expect(firestoreCall[1]).toBe("127.0.0.1");
    const functionsCall = mocks.connectFunctionsEmulator.mock.calls[0] as [unknown, string, number];
    expect(functionsCall[1]).toBe("127.0.0.1");
  });

  it("regression: importing the module never leaves the emulator unconnected in emulator mode — the staff-auth bug this guards against", async () => {
    // The original bug: a new module imported `auth`/`functions` from this
    // file but nothing ever called connectToEmulatorsIfConfigured() for it.
    // Since the connection is now a guaranteed module-load side effect here,
    // merely importing the client module is enough — there is no separate
    // "did the consumer remember to call it" step left to forget.
    const client = await loadClientWith("emulator", true);
    expect(client.auth).toBeDefined();
    expect(client.functions).toBeDefined();
    expect(mocks.connectAuthEmulator).toHaveBeenCalled();
    expect(mocks.connectFunctionsEmulator).toHaveBeenCalled();
  });

  it("never touches the emulator in fixture mode", async () => {
    await loadClientWith("fixture", true);
    expect(mocks.connectAuthEmulator).not.toHaveBeenCalled();
    expect(mocks.connectFirestoreEmulator).not.toHaveBeenCalled();
    expect(mocks.connectFunctionsEmulator).not.toHaveBeenCalled();
  });

  it("fails loudly instead of silently risking a real project when DATA_MODE=emulator but the emulator flag is off", async () => {
    await expect(loadClientWith("emulator", false)).rejects.toThrow(/emulator/i);
    expect(mocks.connectAuthEmulator).not.toHaveBeenCalled();
    expect(mocks.connectFirestoreEmulator).not.toHaveBeenCalled();
    expect(mocks.connectFunctionsEmulator).not.toHaveBeenCalled();
  });

  it("connectToEmulatorsIfConfigured() is idempotent — calling it again after module load is a no-op", async () => {
    const client = await loadClientWith("emulator", true);
    expect(mocks.connectAuthEmulator).toHaveBeenCalledTimes(1);
    client.connectToEmulatorsIfConfigured();
    client.connectToEmulatorsIfConfigured();
    expect(mocks.connectAuthEmulator).toHaveBeenCalledTimes(1);
  });
});
