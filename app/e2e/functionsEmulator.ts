import type { Page } from "@playwright/test";
import { assertLoopbackEmulatorUrl, getIsolatedEmulatorConfig } from "./isolatedEmulatorConfig";

/**
 * Builds a direct HTTP URL for a Cloud Functions callable, for tests that
 * need to invoke a function WITHOUT going through the app's UI (e.g. to
 * simulate a competing request racing the user's own in-progress
 * submission). NOT a test file itself — no `test`/`describe` here.
 *
 * Uses the standard Firebase callable HTTP protocol directly
 * (`POST {"data": <payload>}` → `{"result": <value>}` or `{"error": {...}}`)
 * — the same wire format `httpsCallable` uses internally.
 *
 * Always targets an explicit, validated isolated emulator instance — see
 * `isolatedEmulatorConfig.ts` for why there is no fallback to the live
 * preview's project/ports. `TEST_PROJECT_ID` / `TEST_AUTH_EMULATOR_PORT` /
 * `TEST_FIRESTORE_EMULATOR_PORT` / `TEST_FUNCTIONS_EMULATOR_PORT` must all
 * be set to a genuinely isolated instance (see docs/PROGRESS.md "isolated
 * emulator test ports") before any test using this helper is run.
 */
export function callableUrl(functionName: string): string {
  const { projectId, functionsPort } = getIsolatedEmulatorConfig();
  const url = `http://127.0.0.1:${functionsPort}/${projectId}/us-central1/${functionName}`;
  assertLoopbackEmulatorUrl(url, functionsPort);
  return url;
}

/**
 * Waits for the first real request the given page makes to the Functions
 * emulator and asserts it targets the SAME isolated project id and port
 * that `callableUrl()` computes from `process.env`.
 *
 * Why this exists: the browser page's Firebase config (`VITE_FIREBASE_*`)
 * is baked in at `vite build` time, while this Node-side helper reads
 * `TEST_*` from the Playwright process's own environment at run time —
 * two independent sources of truth, set via two separate shell commands
 * per the isolated-run workflow. Nothing structurally stops them from
 * drifting apart (e.g. the build was done with isolated ports but the test
 * process was later run in a fresh shell that forgot to re-export them).
 * This is a runtime proof that both sides actually agree, not just that
 * each one independently looks valid.
 */
export async function assertPageTargetsIsolatedFunctions(page: Page): Promise<void> {
  const { projectId, functionsPort } = getIsolatedEmulatorConfig();
  const expectedPrefix = `:${functionsPort}/${projectId}/us-central1/`;
  const request = await page.waitForRequest((req) => req.url().includes(expectedPrefix), { timeout: 15_000 });
  const parsed = new URL(request.url());
  assertLoopbackEmulatorUrl(`${parsed.protocol}//${parsed.host}`, functionsPort);
}
