/**
 * Integration test against the real Functions emulator (and thus the real
 * `firebase.json` config + compiled functions/lib/index.js). Only meaningful
 * run inside `firebase emulators:exec` — see the root `test:emulators`
 * script, which builds functions and wraps this test with the emulator
 * lifecycle. Running `npm run test -w functions` directly will fail to
 * connect since nothing will be listening on the emulator port.
 */
import { initializeApp } from "firebase/app";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { describe, expect, it } from "vitest";
import type { PingResponse } from "../src/index";

describe("ping (via Functions emulator)", () => {
  it("responds with ok: true", async () => {
    const app = initializeApp({ projectId: "demo-apex-cinema" }, "ping-emulator-test");
    const functions = getFunctions(app);
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
    const ping = httpsCallable<Record<string, never>, PingResponse>(functions, "ping");
    const result = await ping({});
    expect(result.data.ok).toBe(true);
    expect(result.data.bookingCoreLinked).toBe(true);
  });
});
