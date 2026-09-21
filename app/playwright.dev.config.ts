import { defineConfig, devices } from "@playwright/test";

// Deliberately NOT 5173 (Vite's default, and the port the developer's own
// live preview `npm run dev` normally runs on) — this suite always starts
// its own fresh dev server (`reuseExistingServer: false`), so sharing the
// default port would either collide with an already-running live preview
// (the command would fail to bind it) or, worse, silently let this test's
// Confirm-extension step land on a REAL preview booking. `--strict-port`
// below makes Vite fail loudly instead of silently picking a different
// port if this one is ever unexpectedly occupied.
const PORT = 5183;

/**
 * Runs against the REAL `vite dev` server — its dev-time module transform
 * and `optimizeDeps` dependency-pre-bundling pipeline — never a production
 * build. `playwright.config.ts` (the normal suite) always serves
 * `app/dist` via `vite preview`, which is a full, static Rollup bundle
 * with no persistent cross-run cache to go stale; it structurally cannot
 * exercise `vite dev`'s dependency-optimizer caching at all.
 *
 * Exists specifically because of the "blank screen on Extend" bug
 * (docs/PROGRESS.md) — a real user hit a crash in `vite dev` mode that
 * every existing Playwright test (all running against the production
 * build) was blind to by construction. This isn't a stand-in for that
 * suite; it's the one thing that suite can never cover.
 *
 * Isolated-emulator coordinates are read from the same TEST_* / VITE_FIREBASE_*
 * env vars scripts/test-e2e-devmode-isolated.sh exports (falling back to
 * firebase.test.json's own defaults if run standalone) — never the live
 * preview's default project/ports.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${PORT} --strict-port`,
    url: `http://127.0.0.1:${PORT}`,
    // Always start a genuinely fresh dev server for this suite — never
    // reuse one that might already be running (e.g. the developer's own
    // live preview), which would defeat the point of testing a real,
    // freshly-started dev-mode dependency-optimization pass.
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      VITE_DATA_MODE: "emulator",
      VITE_FIREBASE_EMULATOR_HOST: "127.0.0.1",
      VITE_FIREBASE_EMULATOR_AUTH_PORT: process.env.TEST_AUTH_EMULATOR_PORT ?? "9199",
      VITE_FIREBASE_EMULATOR_FIRESTORE_PORT: process.env.TEST_FIRESTORE_EMULATOR_PORT ?? "8180",
      VITE_FIREBASE_EMULATOR_FUNCTIONS_PORT: process.env.TEST_FUNCTIONS_EMULATOR_PORT ?? "5101",
      VITE_FIREBASE_PROJECT_ID: process.env.TEST_PROJECT_ID ?? "demo-apex-cinema-test",
    },
  },
});
