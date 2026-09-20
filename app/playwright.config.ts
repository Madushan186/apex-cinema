import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

export default defineConfig({
  testDir: "./e2e",
  // Playwright's default glob also matches *.test.ts, which collides with
  // e2e/**/*.test.ts — plain Vitest unit tests for e2e test-support code
  // (e.g. isolatedEmulatorConfig.ts), run separately via `npm run test
  // --workspace app`. Scope Playwright to its own *.spec.ts convention so
  // it never tries to load a Vitest file (it fails immediately trying to
  // resolve vitest's runner outside a vitest process).
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Serves the actual production build (app/dist), not the dev server —
  // this is also how "verify the production build" gets exercised (see
  // root `test:e2e` script, which builds before running Playwright).
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${PORT} --strict-port`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
